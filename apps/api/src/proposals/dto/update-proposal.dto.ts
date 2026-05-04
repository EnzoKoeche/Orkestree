import {
    IsDateString,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
} from 'class-validator';

export class UpdateProposalDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(256)
    title?: string;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    notes?: string | null;

    @IsOptional()
    @IsString()
    @MaxLength(4096)
    clientNotes?: string | null;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    discountPct?: number | null;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    discountAmount?: number | null;

    @IsOptional()
    @IsDateString()
    validUntil?: string | null;
}
