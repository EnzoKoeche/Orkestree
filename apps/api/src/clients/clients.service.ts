import {
    ConflictException,
    Injectable,
    NotFoundException,
    UnprocessableEntityException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
    AuditOperation,
    ClientType,
    CompanyMembership,
    Prisma,
} from '@prisma/client';
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library';
import { ConfigAuditService } from '../company-config/audit/config-audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ClientFieldValuesService } from './client-field-values.service';
import { CreateClientDto } from './dto/create-client.dto';
import { ListClientsDto } from './dto/list-clients.dto';
import { SetClientFieldValueItemDto } from './dto/set-client-field-value.dto';
import { UpdateClientDto } from './dto/update-client.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Response selects
//
// companyId is intentionally excluded from all selects.
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_LIST_SELECT = {
    id: true,
    number: true,
    type: true,
    name: true,
    email: true,
    phone: true,
    taxId: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
} satisfies Prisma.ClientSelect;

const CLIENT_DETAIL_SELECT = {
    ...CLIENT_LIST_SELECT,
    notes: true,
    legalName: true,
    tradeName: true,
    dateOfBirth: true,
    stateRegistration: true,
    municipalRegistration: true,
    addressStreet: true,
    addressNumber: true,
    addressComplement: true,
    addressNeighborhood: true,
    addressCity: true,
    addressState: true,
    addressPostalCode: true,
    addressCountry: true,
} satisfies Prisma.ClientSelect;

// ─────────────────────────────────────────────────────────────────────────────
// ClientsService
//
// Owns creation, update, deactivation, reactivation, list, and get of Clients.
// Field value read/write is delegated to ClientFieldValuesService.
//
// Tenant scoping: all queries include companyId from membership, never from params.
// type is immutable after creation; enforced at service layer.
// name is a maintained denormalized display field:
//   INDIVIDUAL → dto.name
//   BUSINESS   → dto.tradeName (if set) else dto.legalName
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ClientsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly clientFieldValuesService: ClientFieldValuesService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Create ────────────────────────────────────────────────────────────────

    async createClient(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        dto: CreateClientDto,
    ) {
        const { companyId } = actorMembership;

        // Type-specific semantic validation (DTO handles format; service handles business rules)
        if (dto.type === ClientType.INDIVIDUAL && !dto.name?.trim()) {
            throw new UnprocessableEntityException('name is required for INDIVIDUAL clients.');
        }
        if (dto.type === ClientType.BUSINESS && !dto.legalName?.trim()) {
            throw new UnprocessableEntityException('legalName is required for BUSINESS clients.');
        }

        // Validate taxId format matches the declared type before entering the tx
        if (dto.taxId) {
            const digits = dto.taxId.length;
            if (dto.type === ClientType.INDIVIDUAL && digits !== 11) {
                throw new UnprocessableEntityException('CPF must be exactly 11 digits.');
            }
            if (dto.type === ClientType.BUSINESS && digits !== 14) {
                throw new UnprocessableEntityException('CNPJ must be exactly 14 digits.');
            }
        }

        let createdClientId: string | null = null;

        await this.prisma.$transaction(async (tx) => {
            // ── 1. Validate field values before acquiring the advisory lock
            const items = dto.fieldValues ?? [];
            if (items.length > 0) {
                await this.clientFieldValuesService.validateAndLoad(tx, companyId, items);
            }

            // ── 2. Advisory lock keyed by company + context to serialize number generation
            //       without contending with ServiceRequest number generation.
            //       taxId uniqueness is checked after this lock (step 3) so that concurrent
            //       creates for the same company are serialized and the pre-flight read
            //       is race-free under READ COMMITTED isolation.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ':clients'})::bigint)`;

            // ── 3. Validate taxId uniqueness — after advisory lock (see step 2).
            //       The DB partial unique index is the hard safety net; this gives a
            //       user-friendly 409 before the DB would reject the INSERT.
            if (dto.taxId) {
                const conflict = await tx.client.findFirst({
                    where: { companyId, taxId: dto.taxId },
                    select: { id: true },
                });
                if (conflict) {
                    throw new ConflictException(
                        `A client with taxId "${dto.taxId}" already exists in this company.`,
                    );
                }
            }

            // ── 4. Generate sequential client number
            const [maxRow] = await tx.$queryRaw<Array<{ max: number | null }>>`
                SELECT MAX(number)::int AS max
                FROM "Client"
                WHERE "companyId" = ${companyId}
            `;
            const clientNumber = (maxRow?.max ?? 0) + 1;

            // ── 5. Compute denormalized display name
            const name = computeDisplayName(dto.type, {
                name: dto.name,
                legalName: dto.legalName,
                tradeName: dto.tradeName,
            });

            // ── 6. Create the Client row
            const created = await tx.client.create({
                data: {
                    companyId,
                    number: clientNumber,
                    type: dto.type,
                    name,
                    email: dto.email ?? null,
                    phone: dto.phone ?? null,
                    notes: dto.notes ?? null,
                    taxId: dto.taxId ?? null,
                    dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : null,
                    legalName: dto.legalName ?? null,
                    tradeName: dto.tradeName ?? null,
                    stateRegistration: dto.stateRegistration ?? null,
                    municipalRegistration: dto.municipalRegistration ?? null,
                    addressStreet: dto.addressStreet ?? null,
                    addressNumber: dto.addressNumber ?? null,
                    addressComplement: dto.addressComplement ?? null,
                    addressNeighborhood: dto.addressNeighborhood ?? null,
                    addressCity: dto.addressCity ?? null,
                    addressState: dto.addressState ?? null,
                    addressPostalCode: dto.addressPostalCode ?? null,
                    addressCountry: dto.addressCountry ?? 'BR',
                },
                select: { id: true },
            });

            // ── 7. Write field values
            if (items.length > 0) {
                await this.clientFieldValuesService.writeFieldValues(
                    tx,
                    companyId,
                    created.id,
                    items,
                );
            }

            // ── 8. Write audit log
            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.CREATE,
                entityType: 'Client',
                entityId: created.id,
                entityCode: String(clientNumber),
                after: {
                    number: clientNumber,
                    type: dto.type,
                    name,
                    taxId: dto.taxId ?? null,
                },
            });

            createdClientId = created.id;
        }).catch((e: unknown) => {
            // Map the DB partial-unique-index violation on taxId to a 409 so
            // concurrent creates that slip past the pre-flight check in step 3
            // still get a user-friendly error instead of a 500.
            if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('A client with this taxId already exists in this company.');
            }
            throw e;
        });

        if (createdClientId) {
            this.events.emit('client.created', { companyId, clientId: createdClientId });
        }

        return this.getClient(companyId, createdClientId!);
    }

    // ── Update ────────────────────────────────────────────────────────────────

    async updateClient(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        clientId: string,
        dto: UpdateClientDto,
    ) {
        const { companyId } = actorMembership;

        // Fast-path: nothing to update
        if (Object.keys(dto).length === 0) {
            return this.getClient(companyId, clientId);
        }

        await this.prisma.$transaction(async (tx) => {
            // ── 1. Lock the row and read current state in one atomic operation
            const rows = await tx.$queryRaw<
                Array<{
                    id: string;
                    type: string;
                    name: string;
                    legalName: string | null;
                    tradeName: string | null;
                    taxId: string | null;
                    isActive: boolean;
                }>
            >`
                SELECT id, type, name, "legalName", "tradeName", "taxId", "isActive"
                FROM "Client"
                WHERE id = ${clientId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            const existing = rows[0];
            if (!existing) throw new NotFoundException('Client not found.');

            if (!existing.isActive) {
                throw new UnprocessableEntityException(
                    'Cannot update an inactive client. Reactivate it first.',
                );
            }

            // ── 2. Validate taxId format vs stored type if taxId is changing
            if (dto.taxId !== undefined && dto.taxId !== null && dto.taxId !== existing.taxId) {
                const digits = dto.taxId.length;
                if (existing.type === ClientType.INDIVIDUAL && digits !== 11) {
                    throw new UnprocessableEntityException('CPF must be exactly 11 digits.');
                }
                if (existing.type === ClientType.BUSINESS && digits !== 14) {
                    throw new UnprocessableEntityException('CNPJ must be exactly 14 digits.');
                }

                const conflict = await tx.client.findFirst({
                    where: { companyId, taxId: dto.taxId, NOT: { id: clientId } },
                    select: { id: true },
                });
                if (conflict) {
                    throw new ConflictException(
                        `A client with taxId "${dto.taxId}" already exists in this company.`,
                    );
                }
            }

            // ── 3. Compute updated display name
            let newName: string | undefined;
            if (existing.type === ClientType.BUSINESS) {
                // For BUSINESS clients, display name is always derived from legalName/tradeName.
                // Direct updates to name are rejected to prevent silent no-ops where the caller
                // believes they updated the display name but the field is computed and ignored.
                if (dto.name !== undefined) {
                    throw new UnprocessableEntityException(
                        'For BUSINESS clients, update tradeName or legalName to change the display name.',
                    );
                }

                // Recompute when either legalName or tradeName is being updated
                if (dto.legalName !== undefined || dto.tradeName !== undefined) {
                    const effectiveLegalName =
                        (dto.legalName?.trim() ?? existing.legalName ?? '').trim();

                    if (!effectiveLegalName) {
                        throw new UnprocessableEntityException(
                            'legalName cannot be blank for a BUSINESS client.',
                        );
                    }

                    const effectiveTradeName =
                        dto.tradeName !== undefined
                            ? dto.tradeName?.trim() ?? null
                            : existing.tradeName?.trim() ?? null;

                    newName = effectiveTradeName || effectiveLegalName;
                }
            } else {
                // INDIVIDUAL
                if (dto.name !== undefined) {
                    if (!dto.name.trim()) {
                        throw new UnprocessableEntityException('name cannot be blank.');
                    }
                    newName = dto.name.trim();
                }
            }

            // ── 4. Build the update data object (only include changed fields)
            const updateData: Prisma.ClientUpdateInput = {};

            if (newName !== undefined) updateData.name = newName;
            if (dto.legalName !== undefined) updateData.legalName = dto.legalName ?? null;
            if (dto.tradeName !== undefined) updateData.tradeName = dto.tradeName ?? null;
            if (dto.email !== undefined) updateData.email = dto.email ?? null;
            if (dto.phone !== undefined) updateData.phone = dto.phone ?? null;
            if (dto.notes !== undefined) updateData.notes = dto.notes ?? null;
            if (dto.taxId !== undefined) updateData.taxId = dto.taxId ?? null;
            if (dto.dateOfBirth !== undefined) {
                updateData.dateOfBirth = dto.dateOfBirth ? new Date(dto.dateOfBirth) : null;
            }
            if (dto.stateRegistration !== undefined) {
                updateData.stateRegistration = dto.stateRegistration ?? null;
            }
            if (dto.municipalRegistration !== undefined) {
                updateData.municipalRegistration = dto.municipalRegistration ?? null;
            }
            if (dto.addressStreet !== undefined) updateData.addressStreet = dto.addressStreet ?? null;
            if (dto.addressNumber !== undefined) updateData.addressNumber = dto.addressNumber ?? null;
            if (dto.addressComplement !== undefined) {
                updateData.addressComplement = dto.addressComplement ?? null;
            }
            if (dto.addressNeighborhood !== undefined) {
                updateData.addressNeighborhood = dto.addressNeighborhood ?? null;
            }
            if (dto.addressCity !== undefined) updateData.addressCity = dto.addressCity ?? null;
            if (dto.addressState !== undefined) updateData.addressState = dto.addressState ?? null;
            if (dto.addressPostalCode !== undefined) {
                updateData.addressPostalCode = dto.addressPostalCode ?? null;
            }
            if (dto.addressCountry !== undefined) {
                updateData.addressCountry = dto.addressCountry ?? null;
            }

            // Tenant-safety invariant: the SELECT FOR UPDATE above verified that this row
            // belongs to companyId. Prisma's update() where accepts only unique fields;
            // id (PK) is the only valid option here. The lock is the tenant enforcement.
            await tx.client.update({ where: { id: clientId }, data: updateData });

            // ── 5. Write audit log
            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.UPDATE,
                entityType: 'Client',
                entityId: clientId,
                before: {
                    name: existing.name,
                    taxId: existing.taxId,
                    legalName: existing.legalName,
                    tradeName: existing.tradeName,
                },
                after: {
                    name: newName ?? existing.name,
                    taxId: dto.taxId !== undefined ? dto.taxId : existing.taxId,
                    legalName: dto.legalName !== undefined ? dto.legalName : existing.legalName,
                    tradeName: dto.tradeName !== undefined ? dto.tradeName : existing.tradeName,
                },
            });
        }).catch((e: unknown) => {
            if (e instanceof PrismaClientKnownRequestError && e.code === 'P2002') {
                throw new ConflictException('A client with this taxId already exists in this company.');
            }
            throw e;
        });

        return this.getClient(companyId, clientId);
    }

    // ── Deactivate ────────────────────────────────────────────────────────────

    async deactivateClient(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        clientId: string,
    ) {
        const { companyId } = actorMembership;

        await this.prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<Array<{ id: string; isActive: boolean }>>`
                SELECT id, "isActive"
                FROM "Client"
                WHERE id = ${clientId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            const existing = rows[0];
            if (!existing) throw new NotFoundException('Client not found.');

            // Idempotent: already inactive — no-op
            if (!existing.isActive) return;

            await tx.client.update({
                where: { id: clientId },
                data: { isActive: false },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.DEACTIVATE,
                entityType: 'Client',
                entityId: clientId,
            });
        });

        return this.getClient(companyId, clientId);
    }

    // ── Reactivate ────────────────────────────────────────────────────────────

    async reactivateClient(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        clientId: string,
    ) {
        const { companyId } = actorMembership;

        await this.prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<Array<{ id: string; isActive: boolean }>>`
                SELECT id, "isActive"
                FROM "Client"
                WHERE id = ${clientId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            const existing = rows[0];
            if (!existing) throw new NotFoundException('Client not found.');

            // Idempotent: already active — no-op
            if (existing.isActive) return;

            await tx.client.update({
                where: { id: clientId },
                data: { isActive: true },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.ACTIVATE,
                entityType: 'Client',
                entityId: clientId,
            });
        });

        return this.getClient(companyId, clientId);
    }

    // ── List ──────────────────────────────────────────────────────────────────

    async listClients(
        companyId: string,
        dto: ListClientsDto,
    ) {
        const where: Prisma.ClientWhereInput = { companyId };

        if (dto.type !== undefined) where.type = dto.type;
        if (dto.isActive !== undefined) where.isActive = dto.isActive;

        if (dto.search) {
            where.OR = [
                { name: { contains: dto.search, mode: 'insensitive' } },
                { taxId: { contains: dto.search } },
            ];
        }

        return this.prisma.client.findMany({
            where,
            select: CLIENT_LIST_SELECT,
            orderBy: [{ name: 'asc' }, { number: 'asc' }],
            take: dto.limit ?? 50,
            skip: dto.skip ?? 0,
        });
    }

    // ── Get ───────────────────────────────────────────────────────────────────

    async getClient(companyId: string, clientId: string) {
        const client = await this.prisma.client.findFirst({
            where: { id: clientId, companyId },
            select: CLIENT_DETAIL_SELECT,
        });
        if (!client) throw new NotFoundException('Client not found.');
        return client;
    }

    // ── Field values ──────────────────────────────────────────────────────────

    async setFieldValues(
        actorMembership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
        clientId: string,
        items: SetClientFieldValueItemDto[],
    ) {
        const { companyId } = actorMembership;

        await this.prisma.$transaction(async (tx) => {
            // ── 1. Lock the row before any state check
            const rows = await tx.$queryRaw<Array<{ id: string; isActive: boolean }>>`
                SELECT id, "isActive"
                FROM "Client"
                WHERE id = ${clientId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;

            const existing = rows[0];
            if (!existing) throw new NotFoundException('Client not found.');

            if (!existing.isActive) {
                throw new UnprocessableEntityException(
                    'Cannot update field values on an inactive client.',
                );
            }

            // ── 2. Deduplicate by customFieldId before validation and writes.
            //       Last occurrence in the submitted array wins — consistent with the Map
            //       iteration order used in validateFieldValues. Without this, two items
            //       targeting the same field would produce concurrent upserts with
            //       non-deterministic results.
            const dedupedItems = [...new Map(items.map((i) => [i.customFieldId, i])).values()];

            // ── 3. Validate and write
            await this.clientFieldValuesService.validateAndLoad(tx, companyId, dedupedItems);
            await this.clientFieldValuesService.writeFieldValues(tx, companyId, clientId, dedupedItems);

            // ── 4. Audit
            await this.auditService.write(tx, {
                companyId,
                actorId: actorMembership.userId,
                operation: AuditOperation.UPDATE,
                entityType: 'ClientFieldValues',
                entityId: clientId,
            });
        });

        return this.clientFieldValuesService.getFieldValues(companyId, clientId);
    }

    async getFieldValues(
        companyId: string,
        clientId: string,
    ) {
        // Existence + tenant check before returning field values
        await this.getClient(companyId, clientId);
        return this.clientFieldValuesService.getFieldValues(companyId, clientId);
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function computeDisplayName(
    type: ClientType,
    fields: { name?: string; legalName?: string; tradeName?: string },
): string {
    if (type === ClientType.INDIVIDUAL) {
        return fields.name!.trim();
    }
    // BUSINESS: tradeName takes priority if set
    return fields.tradeName?.trim() || fields.legalName!.trim();
}
