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
// UpdateProposalItemDto
//
// All fields optional. Service rejects an empty body to avoid silent no-ops.
// Setting discountPct or internalCost to null clears the value; omitting
// the key leaves the stored value unchanged.
// ─────────────────────────────────────────────────────────────────────────────

export class UpdateProposalItemDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(1024)
    description?: string;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsString()
    @MaxLength(32)
    unit?: string | null;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0.0001)
    quantity?: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    unitPrice?: number;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    discountPct?: number | null;

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
