import {
    IsISO8601,
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
// UpdateProposalDto
//
// Editable only while Proposal.status = DRAFT (enforced by ProposalsService).
//
// Pricing fields (subtotal, totalPrice, totalCost) are NOT here — they are
// recomputed by the backend on every item change.
//
// Discount semantics: discountPct and discountAmount are mutually exclusive.
// Setting one to a non-null value while the other is non-null is rejected at
// the service layer; the DB also enforces this via a CHECK constraint.
// To clear a discount, send an explicit null (e.g., {"discountPct": null}).
//
// status, items, and field values are not modifiable through this endpoint.
// They are mutated by their dedicated transition / item / field-value APIs.
// ─────────────────────────────────────────────────────────────────────────────

export class UpdateProposalDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(256)
    title?: string;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsString()
    @MaxLength(4096)
    notes?: string | null;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsString()
    @MaxLength(4096)
    clientNotes?: string | null;

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
    discountAmount?: number | null;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsISO8601()
    validUntil?: string | null;
}
