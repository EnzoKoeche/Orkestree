import {
    BadRequestException,
    Injectable,
    UnprocessableEntityException,
} from '@nestjs/common';
import { CustomFieldType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SetClientFieldValueItemDto } from './dto/set-client-field-value.dto';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type ApplicableField = {
    id: string;
    code: string;
    type: CustomFieldType;
    isRequired: boolean;
    options: { value: string }[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Selects
// ─────────────────────────────────────────────────────────────────────────────

const CLIENT_FIELD_VALUE_SELECT = {
    id: true,
    customFieldId: true,
    valueText: true,
    valueNumber: true,
    valueBoolean: true,
    valueDate: true,
    valueMulti: true,
    customField: {
        select: {
            id: true,
            code: true,
            label: true,
            type: true,
        },
    },
} satisfies Prisma.ClientFieldValueSelect;

// ─────────────────────────────────────────────────────────────────────────────
// ClientFieldValuesService
//
// Handles validation and persistence of custom field values on Clients.
// CLIENT fields are not scoped by serviceTypeId — any active CustomField with
// target = CLIENT and companyId match is applicable.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class ClientFieldValuesService {
    constructor(private readonly prisma: PrismaService) { }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Loads applicable client fields and validates the submitted items.
     * Must be called inside an open Prisma transaction.
     */
    async validateAndLoad(
        tx: Prisma.TransactionClient,
        companyId: string,
        items: SetClientFieldValueItemDto[],
    ): Promise<ApplicableField[]> {
        const applicableFields = await this.loadApplicableFields(tx, companyId);
        this.validateFieldValues(applicableFields, items);
        return applicableFields;
    }

    /**
     * Upserts field values for a client. Call after validateAndLoad.
     * Must be called inside an open Prisma transaction.
     */
    async writeFieldValues(
        tx: Prisma.TransactionClient,
        companyId: string,
        clientId: string,
        items: SetClientFieldValueItemDto[],
    ): Promise<void> {
        await Promise.all(
            items.map((item) => {
                const valueDate = item.valueDate ? new Date(item.valueDate) : null;
                return tx.clientFieldValue.upsert({
                    where: {
                        clientId_customFieldId: {
                            clientId,
                            customFieldId: item.customFieldId,
                        },
                    },
                    create: {
                        companyId,
                        clientId,
                        customFieldId: item.customFieldId,
                        valueText: item.valueText ?? null,
                        valueNumber: item.valueNumber ?? null,
                        valueBoolean: item.valueBoolean ?? null,
                        valueDate,
                        valueMulti: item.valueMulti ?? [],
                    },
                    update: {
                        valueText: item.valueText ?? null,
                        valueNumber: item.valueNumber ?? null,
                        valueBoolean: item.valueBoolean ?? null,
                        valueDate,
                        valueMulti: item.valueMulti ?? [],
                    },
                });
            }),
        );
    }

    /**
     * Reads all field values for a client, including field metadata.
     * Does NOT include companyId or clientId in the returned shape.
     */
    async getFieldValues(companyId: string, clientId: string) {
        return this.prisma.clientFieldValue.findMany({
            where: { companyId, clientId },
            select: CLIENT_FIELD_VALUE_SELECT,
            orderBy: { customField: { sortOrder: 'asc' } },
        });
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private async loadApplicableFields(
        tx: Prisma.TransactionClient,
        companyId: string,
    ): Promise<ApplicableField[]> {
        return tx.customField.findMany({
            where: {
                companyId,
                target: 'CLIENT',
                isActive: true,
            },
            select: {
                id: true,
                code: true,
                type: true,
                isRequired: true,
                options: { select: { value: true } },
            },
        });
    }

    private validateFieldValues(
        applicableFields: ApplicableField[],
        items: SetClientFieldValueItemDto[],
    ): void {
        const fieldMap = new Map(applicableFields.map((f) => [f.id, f]));
        const itemMap = new Map(items.map((i) => [i.customFieldId, i]));

        // Reject field IDs not applicable to this company's client fields
        for (const item of items) {
            if (!fieldMap.has(item.customFieldId)) {
                throw new BadRequestException(
                    `Custom field "${item.customFieldId}" is not a valid client field for this company.`,
                );
            }
        }

        // Check required fields are present
        const missingRequired = applicableFields.filter(
            (f) => f.isRequired && !itemMap.has(f.id),
        );
        if (missingRequired.length > 0) {
            throw new UnprocessableEntityException(
                `Required client fields missing: ${missingRequired.map((f) => f.code).join(', ')}.`,
            );
        }

        // Type and option validation per submitted item
        for (const [fieldId, item] of itemMap) {
            const field = fieldMap.get(fieldId)!;
            this.validateSingleFieldValue(field, item);
        }
    }

    private validateSingleFieldValue(
        field: ApplicableField,
        item: SetClientFieldValueItemDto,
    ): void {
        switch (field.type) {
            case CustomFieldType.TEXT:
            case CustomFieldType.TEXTAREA:
            case CustomFieldType.PHONE:
            case CustomFieldType.EMAIL:
            case CustomFieldType.URL:
            case CustomFieldType.FILE: {
                if (item.valueText === null || item.valueText === undefined) {
                    throw new UnprocessableEntityException(
                        `Field "${field.code}" requires a text value.`,
                    );
                }
                break;
            }

            case CustomFieldType.SELECT: {
                if (item.valueText === null || item.valueText === undefined) {
                    throw new UnprocessableEntityException(
                        `Field "${field.code}" requires a text value.`,
                    );
                }
                const validOptions = new Set(field.options.map((o) => o.value));
                if (!validOptions.has(item.valueText)) {
                    throw new UnprocessableEntityException(
                        `Value "${item.valueText}" is not a valid option for field "${field.code}".`,
                    );
                }
                break;
            }

            case CustomFieldType.NUMBER:
            case CustomFieldType.DECIMAL: {
                if (item.valueNumber === null || item.valueNumber === undefined) {
                    throw new UnprocessableEntityException(
                        `Field "${field.code}" requires a numeric value.`,
                    );
                }
                break;
            }

            case CustomFieldType.BOOLEAN: {
                if (item.valueBoolean === null || item.valueBoolean === undefined) {
                    throw new UnprocessableEntityException(
                        `Field "${field.code}" requires a boolean value.`,
                    );
                }
                break;
            }

            case CustomFieldType.DATE:
            case CustomFieldType.DATETIME: {
                if (item.valueDate === null || item.valueDate === undefined) {
                    throw new UnprocessableEntityException(
                        `Field "${field.code}" requires a date value.`,
                    );
                }
                break;
            }

            case CustomFieldType.MULTISELECT: {
                if (!item.valueMulti || item.valueMulti.length === 0) {
                    throw new UnprocessableEntityException(
                        `Field "${field.code}" requires at least one selected value.`,
                    );
                }
                const validOptions = new Set(field.options.map((o) => o.value));
                const invalid = item.valueMulti.filter((v) => !validOptions.has(v));
                if (invalid.length > 0) {
                    throw new UnprocessableEntityException(
                        `Invalid option values for field "${field.code}": ${invalid.join(', ')}.`,
                    );
                }
                break;
            }
        }
    }
}
