import {
    BadRequestException,
    Injectable,
    UnprocessableEntityException,
} from '@nestjs/common';
import { CustomFieldType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SetFieldValueItemDto } from './dto/set-field-value.dto';

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

const FIELD_VALUE_SELECT = {
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
} satisfies Prisma.RequestFieldValueSelect;

// ─────────────────────────────────────────────────────────────────────────────
// FieldValuesService
//
// Handles validation and persistence of custom field values on ServiceRequests.
// Validation is done in two passes:
//   1. loadApplicableFields — loads the field definitions for this company
//      and service type from within an open transaction.
//   2. validateFieldValues (private) — pure type + option validation.
//
// writeFieldValues upserts all submitted values. It must be called only after
// validateFieldValues has confirmed the payload is valid.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class FieldValuesService {
    constructor(private readonly prisma: PrismaService) { }

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Loads applicable fields and validates the submitted items.
     * Must be called inside an open Prisma transaction.
     */
    async validateAndLoad(
        tx: Prisma.TransactionClient,
        companyId: string,
        serviceTypeId: string,
        items: SetFieldValueItemDto[],
    ): Promise<ApplicableField[]> {
        const applicableFields = await this.loadApplicableFields(tx, companyId, serviceTypeId);
        this.validateFieldValues(applicableFields, items);
        return applicableFields;
    }

    /**
     * Upserts field values for a request. Call after validateAndLoad.
     * Must be called inside an open Prisma transaction.
     */
    async writeFieldValues(
        tx: Prisma.TransactionClient,
        companyId: string,
        requestId: string,
        items: SetFieldValueItemDto[],
    ): Promise<void> {
        await Promise.all(
            items.map((item) => {
                const valueDate = item.valueDate ? new Date(item.valueDate) : null;
                return tx.requestFieldValue.upsert({
                    where: {
                        requestId_customFieldId: {
                            requestId,
                            customFieldId: item.customFieldId,
                        },
                    },
                    create: {
                        companyId,
                        requestId,
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
     * Reads all field values for a request, including field metadata.
     * Does NOT include companyId or requestId in the returned shape.
     */
    async getFieldValues(companyId: string, requestId: string) {
        return this.prisma.requestFieldValue.findMany({
            where: { companyId, requestId },
            select: FIELD_VALUE_SELECT,
            orderBy: { customField: { sortOrder: 'asc' } },
        });
    }

    // ── Private ───────────────────────────────────────────────────────────────

    private async loadApplicableFields(
        tx: Prisma.TransactionClient,
        companyId: string,
        serviceTypeId: string,
    ): Promise<ApplicableField[]> {
        return tx.customField.findMany({
            where: {
                companyId,
                target: 'REQUEST',
                isActive: true,
                OR: [{ serviceTypeId }, { serviceTypeId: null }],
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
        items: SetFieldValueItemDto[],
    ): void {
        const fieldMap = new Map(applicableFields.map((f) => [f.id, f]));
        const itemMap = new Map(items.map((i) => [i.customFieldId, i]));

        // Reject field IDs not applicable to this request
        for (const item of items) {
            if (!fieldMap.has(item.customFieldId)) {
                throw new BadRequestException(
                    `Custom field "${item.customFieldId}" is not applicable to this service type.`,
                );
            }
        }

        // Check required fields are present
        const missingRequired = applicableFields.filter(
            (f) => f.isRequired && !itemMap.has(f.id),
        );
        if (missingRequired.length > 0) {
            throw new UnprocessableEntityException(
                `Required fields missing: ${missingRequired.map((f) => f.code).join(', ')}.`,
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
        item: SetFieldValueItemDto,
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
