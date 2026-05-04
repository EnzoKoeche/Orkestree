import { Transform } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ProposalStatus } from '@prisma/client';

export class ListProposalsDto {
    @IsOptional()
    @IsEnum(ProposalStatus)
    status?: ProposalStatus;

    @IsOptional()
    @IsString()
    serviceRequestId?: string;

    @IsOptional()
    @IsString()
    clientId?: string;

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
