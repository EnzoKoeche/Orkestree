import {
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
} from 'class-validator';

// ─────────────────────────────────────────────────────────────────────────────
// CreateProposalItemDto
//
// Used both by CreateProposalDto.items[] (initial creation) and by the
// items endpoint to add a single item to an existing DRAFT proposal.
//
// subtotal is intentionally absent: it is computed by the service as
// quantity × unitPrice × (1 − discountPct/100).
// ─────────────────────────────────────────────────────────────────────────────

export class CreateProposalItemDto {
    @IsString()
    @MinLength(1)
    @MaxLength(1024)
    description: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    unit?: string;

    // Decimal(12, 4): supports fractional quantities (e.g. 1.25 hours).
    // Allowing 4 decimals matches the Prisma column scale.
    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0.0001)
    quantity: number;

    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    unitPrice: number;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    discountPct?: number | null;

    // Internal cost per unit. PRIVILEGED-only on response. Accepted from any
    // role at write time only if the caller has PROPOSAL.EDIT permission and
    // the field-write authorization in ProposalItemsService approves it.
    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    internalCost?: number | null;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}
