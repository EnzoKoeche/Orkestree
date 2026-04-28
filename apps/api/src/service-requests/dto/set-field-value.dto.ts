import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsISO8601,
    IsNumber,
    IsOptional,
    IsString,
    ValidateIf,
    ValidateNested,
} from 'class-validator';

export class SetFieldValueItemDto {
    @IsString()
    customFieldId: string;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsString()
    valueText?: string | null;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsNumber()
    valueNumber?: number | null;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsBoolean()
    valueBoolean?: boolean | null;

    @IsOptional()
    @ValidateIf((_, v) => v !== null)
    @IsISO8601()
    valueDate?: string | null;

    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    valueMulti?: string[];
}

export class SetFieldValuesDto {
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => SetFieldValueItemDto)
    fieldValues: SetFieldValueItemDto[];
}
