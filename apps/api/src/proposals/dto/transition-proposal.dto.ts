import { IsOptional, IsString, MaxLength } from 'class-validator';

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle transition DTOs.
//
// Each terminal action has its own endpoint and DTO so each can carry its
// own contextual fields (rejectionReason, cancellationReason). This avoids
// the "polymorphic action body" anti-pattern where a single endpoint
// dispatches on a string field — that pattern obscures permission and audit
// boundaries.
// ─────────────────────────────────────────────────────────────────────────────

export class SendProposalDto {
    @IsOptional()
    @IsString()
    @MaxLength(1024)
    note?: string;
}

export class ApproveProposalDto {
    @IsOptional()
    @IsString()
    @MaxLength(1024)
    note?: string;
}

export class RejectProposalDto {
    @IsOptional()
    @IsString()
    @MaxLength(1024)
    reason?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1024)
    note?: string;
}

export class CancelProposalDto {
    @IsOptional()
    @IsString()
    @MaxLength(1024)
    reason?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1024)
    note?: string;
}
