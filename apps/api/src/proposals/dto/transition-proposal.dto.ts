import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ProposalStatus } from '@prisma/client';

export class TransitionProposalDto {
    @IsEnum(ProposalStatus)
    toStatus: ProposalStatus;

    @IsOptional()
    @IsString()
    @MaxLength(1024)
    note?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1024)
    rejectionReason?: string;

    @IsOptional()
    @IsString()
    @MaxLength(1024)
    cancellationReason?: string;
}
