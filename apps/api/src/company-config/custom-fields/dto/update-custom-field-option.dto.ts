import {
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

export class UpdateCustomFieldOptionDto {
    // value is intentionally absent — it is immutable after creation.

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    label?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}
