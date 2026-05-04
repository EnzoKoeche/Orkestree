import { ProposalStatus } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export class ListProposalsDto {
    @IsOptional()
    @IsString()
    serviceRequestId?: string;

    @IsOptional()
    @IsString()
    clientId?: string;

    @IsOptional()
    @IsEnum(ProposalStatus)
    status?: ProposalStatus;

    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    @Min(1)
    @Max(100)
    limit?: number;

    @IsOptional()
    @Transform(({ value }) => parseInt(value, 10))
    @IsInt()
    @Min(0)
    skip?: number;
}
