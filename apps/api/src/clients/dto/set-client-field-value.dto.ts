import {
    IsArray,
    IsBoolean,
    IsISO8601,
    IsNumber,
    IsOptional,
    IsString,
    ValidateIf,
} from 'class-validator';

export class SetClientFieldValueItemDto {
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

export class SetClientFieldValuesDto {
    @IsArray()
    items: SetClientFieldValueItemDto[];
}
