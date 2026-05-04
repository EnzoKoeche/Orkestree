import { Type } from 'class-transformer';
import {
    IsArray,
    IsDateString,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator';
import { CreateProposalItemDto } from './create-proposal-item.dto';

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
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    discountPct?: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    discountAmount?: number;

    @IsOptional()
    @IsDateString()
    validUntil?: string;

    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateProposalItemDto)
    items?: CreateProposalItemDto[];
}
