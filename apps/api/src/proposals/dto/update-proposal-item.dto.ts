import {
    IsInt,
    IsNumber,
    IsOptional,
    IsString,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

export class UpdateProposalItemDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(512)
    description?: string;

    @IsOptional()
    @IsString()
    @MaxLength(32)
    unit?: string | null;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 4 })
    @Min(0)
    quantity?: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    unitPrice?: number;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    @Max(100)
    discountPct?: number | null;

    @IsOptional()
    @IsNumber({ maxDecimalPlaces: 2 })
    @Min(0)
    internalCost?: number | null;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}
