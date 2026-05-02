import { Type } from 'class-transformer';
import {
    IsArray,
    IsISO8601,
    IsOptional,
    IsString,
    MaxLength,
    MinLength,
    ValidateNested,
} from 'class-validator';
import { CreateProposalItemDto } from './create-proposal-item.dto';

// ─────────────────────────────────────────────────────────────────────────────
// CreateProposalDto
//
// Pricing fields (subtotal, totalPrice, totalCost) are intentionally NOT in
// this DTO. They are computed server-side from the items array by
// ProposalItemsService.recompute. Trusting client-provided totals would be a
// pricing-integrity bug.
//
// clientId is also NOT here: the proposal's client anchor is derived from the
// linked ServiceRequest at creation time and stored on the proposal so it
// survives subsequent request edits.
// ─────────────────────────────────────────────────────────────────────────────

export class CreateProposalDto {
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    serviceRequestId: string;

    @IsString()
    @MinLength(1)
    @MaxLength(256)
    title: string;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    notes?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    clientNotes?: string;

    @IsOptional()
    @IsISO8601()
    validUntil?: string;

    // Initial items; can be empty. Items can also be added later while in DRAFT.
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateProposalItemDto)
    items?: CreateProposalItemDto[];
}
