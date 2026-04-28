import {
    BadRequestException,
    ConflictException,
    Injectable,
    NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { AuditOperation, CustomFieldTarget, CustomFieldType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ConfigAuditService } from '../audit/config-audit.service';
import { CreateCustomFieldOptionDto } from './dto/create-custom-field-option.dto';
import { CreateCustomFieldDto } from './dto/create-custom-field.dto';
import { ListCustomFieldsDto } from './dto/list-custom-fields.dto';
import { UpdateCustomFieldOptionDto } from './dto/update-custom-field-option.dto';
import { UpdateCustomFieldDto } from './dto/update-custom-field.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Field types that support options. Any attempt to add options to a field of a
// different type is rejected at the service layer before reaching the database.
// ─────────────────────────────────────────────────────────────────────────────

const OPTION_SUPPORTING_TYPES = new Set<CustomFieldType>([
    CustomFieldType.SELECT,
    CustomFieldType.MULTISELECT,
]);

// ─────────────────────────────────────────────────────────────────────────────
// Explicit selects on all read paths.
// companyId is internal tenant data and must not appear in any response.
// ─────────────────────────────────────────────────────────────────────────────

const OPTION_SELECT = {
    id: true,
    label: true,
    value: true,
    sortOrder: true,
} satisfies Prisma.CustomFieldOptionSelect;

const LIST_SELECT = {
    id: true,
    code: true,
    label: true,
    target: true,
    // serviceTypeId excluded from the public API contract — the serviceType relation
    // already exposes serviceType.id for consumers that need the FK reference.
    // Returning the raw FK alongside the relation object is redundant and leaks an
    // internal identifier that callers should not need to store or forward.
    type: true,
    isRequired: true,
    isActive: true,
    sortOrder: true,
    placeholder: true,
    helpText: true,
    createdAt: true,
    updatedAt: true,
    serviceType: {
        select: { id: true, code: true, name: true, isActive: true },
    },
} satisfies Prisma.CustomFieldSelect;

const DETAIL_SELECT = {
    ...LIST_SELECT,
    options: {
        select: OPTION_SELECT,
        orderBy: { sortOrder: 'asc' as const },
    },
} satisfies Prisma.CustomFieldSelect;

@Injectable()
export class CustomFieldsService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly auditService: ConfigAuditService,
        private readonly events: EventEmitter2,
    ) { }

    // ── Queries ───────────────────────────────────────────────────────────────

    async listCustomFields(companyId: string, dto: ListCustomFieldsDto) {
        // serviceTypeId is semantically valid only for REQUEST fields.
        // Providing it with an explicit non-REQUEST target is a caller error.
        if (
            dto.serviceTypeId !== undefined &&
            dto.target !== undefined &&
            dto.target !== CustomFieldTarget.REQUEST
        ) {
            throw new BadRequestException(
                'serviceTypeId filter is only valid when target is REQUEST.',
            );
        }

        return this.prisma.customField.findMany({
            where: {
                companyId,
                // When serviceTypeId is present, always enforce target = REQUEST regardless
                // of whether the caller also supplied it explicitly. This prevents cross-target
                // leakage if the uniqueness invariant is ever violated at the DB level.
                ...(dto.serviceTypeId !== undefined
                    ? { serviceTypeId: dto.serviceTypeId, target: CustomFieldTarget.REQUEST }
                    : dto.target !== undefined ? { target: dto.target } : {}),
                ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
            },
            select: LIST_SELECT,
            orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
        });
    }

    async getCustomField(companyId: string, fieldId: string) {
        const field = await this.prisma.customField.findFirst({
            where: { id: fieldId, companyId },
            select: DETAIL_SELECT,
        });
        if (!field) throw new NotFoundException('Custom field not found.');
        return field;
    }

    // ── Field commands ────────────────────────────────────────────────────────

    async createCustomField(
        companyId: string,
        actorId: string,
        dto: CreateCustomFieldDto,
    ) {
        // Pure semantic validations outside the transaction — no DB access needed.
        this.assertServiceTypeIdCompatibility(dto.target, dto.serviceTypeId ?? null);
        this.assertOptionsCompatibility(dto.type, dto.options);

        try {
            const field = await this.prisma.$transaction(async (tx) => {
                // Validate serviceTypeId inside the transaction to prevent a concurrent
                // deactivation from racing past this check before the row is committed.
                if (dto.serviceTypeId) {
                    await this.assertServiceTypeActive(tx, companyId, dto.serviceTypeId);
                }

                const created = await tx.customField.create({
                    data: {
                        companyId,
                        code: dto.code,
                        label: dto.label,
                        target: dto.target,
                        serviceTypeId: dto.serviceTypeId ?? null,
                        type: dto.type,
                        isRequired: dto.isRequired ?? false,
                        sortOrder: dto.sortOrder ?? 0,
                        placeholder: dto.placeholder ?? null,
                        helpText: dto.helpText ?? null,
                        // Options are created atomically with the field so the entire
                        // CREATE is a single auditable event rather than N+1 events.
                        ...(dto.options && dto.options.length > 0
                            ? {
                                options: {
                                    create: dto.options.map((o, i) => ({
                                        label: o.label,
                                        value: o.value,
                                        sortOrder: o.sortOrder ?? i,
                                    })),
                                },
                            }
                            : {}),
                    },
                    select: DETAIL_SELECT,
                });

                await this.auditService.write(tx, {
                    companyId,
                    actorId,
                    operation: AuditOperation.CREATE,
                    entityType: 'CustomField',
                    entityId: created.id,
                    entityCode: created.code,
                    after: {
                        code: created.code,
                        label: created.label,
                        target: created.target,
                        type: created.type,
                        // serviceTypeId is excluded from DETAIL_SELECT (not part of the public API).
                        // Use the dto value which is authoritative at creation time.
                        serviceTypeId: dto.serviceTypeId ?? null,
                        isRequired: created.isRequired,
                        sortOrder: created.sortOrder,
                        optionCount: created.options?.length ?? 0,
                    },
                });

                return created;
            });

            this.events.emit('config.custom-field.created', { companyId, fieldId: field.id });
            return field;
        } catch (err) {
            if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002' &&
                (err.meta as { target?: string[] } | undefined)?.target?.includes('code')
            ) {
                throw new ConflictException(
                    `A custom field with code "${dto.code}" already exists in this company.`,
                );
            }
            throw err;
        }
    }

    async updateCustomField(
        companyId: string,
        fieldId: string,
        actorId: string,
        dto: UpdateCustomFieldDto,
    ) {
        const field = await this.prisma.$transaction(async (tx) => {
            const before = await tx.customField.findFirst({
                where: { id: fieldId, companyId },
                select: {
                    id: true,
                    code: true,
                    target: true,
                    label: true,
                    isRequired: true,
                    sortOrder: true,
                    placeholder: true,
                    helpText: true,
                    serviceTypeId: true,
                },
            });
            if (!before) throw new NotFoundException('Custom field not found.');

            // serviceTypeId can only be set to a non-null value when target = REQUEST.
            // target is immutable, so we check the stored value against the incoming one.
            if (dto.serviceTypeId !== undefined && dto.serviceTypeId !== null) {
                this.assertServiceTypeIdCompatibility(before.target, dto.serviceTypeId);
                await this.assertServiceTypeActive(tx, companyId, dto.serviceTypeId);
            }

            const updated = await tx.customField.update({
                where: { id: fieldId },
                // Explicit mapping prevents accidental passthrough of undeclared fields.
                // Undefined values are ignored by Prisma — the stored value is preserved.
                data: {
                    label: dto.label,
                    isRequired: dto.isRequired,
                    sortOrder: dto.sortOrder,
                    placeholder: dto.placeholder,
                    helpText: dto.helpText,
                    // Conditional spread: null clears serviceTypeId; undefined leaves it unchanged.
                    ...(dto.serviceTypeId !== undefined ? { serviceTypeId: dto.serviceTypeId } : {}),
                },
                select: DETAIL_SELECT,
            });

            // serviceTypeId is excluded from DETAIL_SELECT (not part of the public API).
            // Compute the effective value from the dto and the pre-update state.
            const effectiveServiceTypeId =
                dto.serviceTypeId !== undefined ? dto.serviceTypeId : before.serviceTypeId;

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.UPDATE,
                entityType: 'CustomField',
                entityId: fieldId,
                entityCode: before.code,
                before: {
                    label: before.label,
                    isRequired: before.isRequired,
                    sortOrder: before.sortOrder,
                    placeholder: before.placeholder,
                    helpText: before.helpText,
                    serviceTypeId: before.serviceTypeId,
                },
                after: {
                    label: updated.label,
                    isRequired: updated.isRequired,
                    sortOrder: updated.sortOrder,
                    placeholder: updated.placeholder,
                    helpText: updated.helpText,
                    serviceTypeId: effectiveServiceTypeId,
                },
            });

            return updated;
        });

        this.events.emit('config.custom-field.updated', { companyId, fieldId });
        return field;
    }

    async deactivateCustomField(
        companyId: string,
        fieldId: string,
        actorId: string,
    ): Promise<void> {
        let deactivated = false;

        await this.prisma.$transaction(async (tx) => {
            // Lock the row to serialize concurrent deactivation attempts and to prevent
            // a concurrent request intake read from observing isActive = true mid-transition.
            const rows = await tx.$queryRaw<
                Array<{ id: string; code: string; isActive: boolean }>
            >`
                SELECT id, code, "isActive"
                FROM "CustomField"
                WHERE id = ${fieldId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;
            if (rows.length === 0) throw new NotFoundException('Custom field not found.');
            const current = rows[0];
            if (!current.isActive) return; // idempotent — already inactive

            // DEFERRED: guard against active RequestFieldValue rows referencing this field.
            // When the Request model is implemented, add:
            //   SELECT COUNT(*) FROM "RequestFieldValue" rf
            //   JOIN "Request" r ON r.id = rf."requestId"
            //   WHERE rf."customFieldId" = fieldId
            //   AND r.status NOT IN ('CLOSED', 'CANCELLED')
            // and throw ConflictException if count > 0.

            await tx.customField.update({
                where: { id: fieldId },
                data: { isActive: false },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.DEACTIVATE,
                entityType: 'CustomField',
                entityId: fieldId,
                entityCode: current.code,
                before: { isActive: true },
                after: { isActive: false },
            });

            deactivated = true;
        });

        if (deactivated) {
            this.events.emit('config.custom-field.deactivated', { companyId, fieldId });
        }
    }

    async activateCustomField(
        companyId: string,
        fieldId: string,
        actorId: string,
    ): Promise<void> {
        let activated = false;

        await this.prisma.$transaction(async (tx) => {
            const rows = await tx.$queryRaw<
                Array<{ id: string; code: string; isActive: boolean }>
            >`
                SELECT id, code, "isActive"
                FROM "CustomField"
                WHERE id = ${fieldId} AND "companyId" = ${companyId}
                FOR UPDATE
            `;
            if (rows.length === 0) throw new NotFoundException('Custom field not found.');
            const current = rows[0];
            if (current.isActive) return; // idempotent — already active

            await tx.customField.update({
                where: { id: fieldId },
                data: { isActive: true },
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.ACTIVATE,
                entityType: 'CustomField',
                entityId: fieldId,
                entityCode: current.code,
                before: { isActive: false },
                after: { isActive: true },
            });

            activated = true;
        });

        if (activated) {
            this.events.emit('config.custom-field.activated', { companyId, fieldId });
        }
    }

    // ── Option commands ───────────────────────────────────────────────────────

    async addOption(
        companyId: string,
        fieldId: string,
        actorId: string,
        dto: CreateCustomFieldOptionDto,
    ) {
        try {
            return await this.prisma.$transaction(async (tx) => {
                const field = await tx.customField.findFirst({
                    where: { id: fieldId, companyId },
                    select: { id: true, code: true, type: true, isActive: true },
                });
                if (!field) throw new NotFoundException('Custom field not found.');

                if (!field.isActive) {
                    throw new BadRequestException(
                        'Cannot add options to an inactive custom field.',
                    );
                }

                if (!OPTION_SUPPORTING_TYPES.has(field.type)) {
                    throw new BadRequestException(
                        `Options are only supported for SELECT and MULTISELECT fields. This field is type ${field.type}.`,
                    );
                }

                const created = await tx.customFieldOption.create({
                    data: {
                        customFieldId: fieldId,
                        label: dto.label,
                        value: dto.value,
                        sortOrder: dto.sortOrder ?? 0,
                    },
                    select: OPTION_SELECT,
                });

                await this.auditService.write(tx, {
                    companyId,
                    actorId,
                    operation: AuditOperation.CREATE,
                    entityType: 'CustomFieldOption',
                    entityId: created.id,
                    // Composite code: fieldCode.optionValue — human-readable in audit UIs
                    // without needing to join to the parent field.
                    entityCode: `${field.code}.${dto.value}`,
                    after: {
                        label: created.label,
                        value: created.value,
                        sortOrder: created.sortOrder,
                    },
                });

                return created;
            });
        } catch (err) {
            if (
                err instanceof Prisma.PrismaClientKnownRequestError &&
                err.code === 'P2002' &&
                (err.meta as { target?: string[] } | undefined)?.target?.includes('value')
            ) {
                throw new ConflictException(
                    `An option with value "${dto.value}" already exists on this field.`,
                );
            }
            throw err;
        }
    }

    async updateOption(
        companyId: string,
        fieldId: string,
        optionId: string,
        actorId: string,
        dto: UpdateCustomFieldOptionDto,
    ) {
        return this.prisma.$transaction(async (tx) => {
            // Verify field belongs to this company; load code for audit entityCode.
            const field = await tx.customField.findFirst({
                where: { id: fieldId, companyId },
                select: { id: true, code: true, isActive: true },
            });
            if (!field) throw new NotFoundException('Custom field not found.');
            if (!field.isActive) {
                throw new BadRequestException(
                    'Cannot update options on an inactive custom field.',
                );
            }

            const before = await tx.customFieldOption.findFirst({
                where: { id: optionId, customFieldId: fieldId },
                select: { id: true, label: true, value: true, sortOrder: true },
            });
            if (!before) throw new NotFoundException('Field option not found.');

            const updated = await tx.customFieldOption.update({
                where: { id: optionId },
                data: {
                    label: dto.label,
                    sortOrder: dto.sortOrder,
                },
                select: OPTION_SELECT,
            });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.UPDATE,
                entityType: 'CustomFieldOption',
                entityId: optionId,
                entityCode: `${field.code}.${before.value}`,
                before: { label: before.label, sortOrder: before.sortOrder },
                after: { label: updated.label, sortOrder: updated.sortOrder },
            });

            return updated;
        });
    }

    async deleteOption(
        companyId: string,
        fieldId: string,
        optionId: string,
        actorId: string,
    ): Promise<void> {
        await this.prisma.$transaction(async (tx) => {
            const field = await tx.customField.findFirst({
                where: { id: fieldId, companyId },
                select: { id: true, code: true, isActive: true },
            });
            if (!field) throw new NotFoundException('Custom field not found.');
            if (!field.isActive) {
                throw new BadRequestException(
                    'Cannot delete options from an inactive custom field.',
                );
            }

            const option = await tx.customFieldOption.findFirst({
                where: { id: optionId, customFieldId: fieldId },
                select: { id: true, label: true, value: true, sortOrder: true },
            });
            if (!option) throw new NotFoundException('Field option not found.');

            // DEFERRED: guard against active RequestFieldValue rows whose stored value
            // matches this option's value. When RequestFieldValue is implemented, add:
            //   SELECT COUNT(*) FROM "RequestFieldValue"
            //   WHERE "customFieldId" = fieldId AND value = option.value
            // and throw ConflictException if count > 0.

            await tx.customFieldOption.delete({ where: { id: optionId } });

            await this.auditService.write(tx, {
                companyId,
                actorId,
                operation: AuditOperation.DELETE,
                entityType: 'CustomFieldOption',
                entityId: optionId,
                entityCode: `${field.code}.${option.value}`,
                before: {
                    label: option.label,
                    value: option.value,
                    sortOrder: option.sortOrder,
                },
            });
        });
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    // Enforces the domain rule: serviceTypeId is only meaningful when target = REQUEST.
    // Called before the transaction for pure validations; called inside the transaction
    // when re-validating against the stored target during updates.
    private assertServiceTypeIdCompatibility(
        target: CustomFieldTarget,
        serviceTypeId: string | null,
    ): void {
        if (serviceTypeId !== null && target !== CustomFieldTarget.REQUEST) {
            throw new BadRequestException(
                'serviceTypeId can only be set when target is REQUEST.',
            );
        }
    }

    private assertOptionsCompatibility(
        type: CustomFieldType,
        options: { value: string }[] | undefined,
    ): void {
        if (options && options.length > 0 && !OPTION_SUPPORTING_TYPES.has(type)) {
            throw new BadRequestException(
                `Options can only be provided for SELECT and MULTISELECT fields. Received type: ${type}.`,
            );
        }
    }

    // Validates that a serviceTypeId exists, is active, and belongs to the same
    // company. Called inside a transaction so the check is consistent with the write.
    private async assertServiceTypeActive(
        tx: Prisma.TransactionClient,
        companyId: string,
        serviceTypeId: string,
    ): Promise<void> {
        const serviceType = await tx.serviceType.findFirst({
            where: { id: serviceTypeId, companyId, isActive: true },
            select: { id: true },
        });
        if (!serviceType) {
            throw new NotFoundException(
                'Service type not found in this company, or it is inactive.',
            );
        }
    }
}
