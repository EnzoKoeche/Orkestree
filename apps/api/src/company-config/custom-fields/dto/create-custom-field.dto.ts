import { CustomFieldTarget, CustomFieldType } from '@prisma/client';
import { Type } from 'class-transformer';
import {
    IsArray,
    IsBoolean,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
    ValidateNested,
} from 'class-validator';
import { CreateCustomFieldOptionDto } from './create-custom-field-option.dto';

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
const CODE_MESSAGE =
    'code must be snake_case (lowercase letters, digits, underscores; must start with a letter)';

export class CreateCustomFieldDto {
    // Immutable after creation — referenced in automation conditions via
    // dot-notation (e.g. request.fields.service_fee).
    @IsString()
    @MinLength(2)
    @MaxLength(64)
    @Matches(CODE_PATTERN, { message: CODE_MESSAGE })
    code: string;

    @IsString()
    @MinLength(1)
    @MaxLength(128)
    label: string;

    // Immutable after creation. Changing target or type would require migration
    // of all associated field values — that is a delete + recreate flow.
    @IsEnum(CustomFieldTarget)
    target: CustomFieldTarget;

    @IsEnum(CustomFieldType)
    type: CustomFieldType;

    // Only valid when target = REQUEST. Cross-field semantic constraint enforced
    // at the service layer. The DB enforces tenant consistency via composite FK.
    @IsOptional()
    @IsString()
    serviceTypeId?: string;

    @IsOptional()
    @IsBoolean()
    isRequired?: boolean;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;

    @IsOptional()
    @IsString()
    @MaxLength(256)
    placeholder?: string;

    @IsOptional()
    @IsString()
    @MaxLength(512)
    helpText?: string;

    // Only valid for type = SELECT or MULTISELECT. Enforced at the service layer.
    // Providing options here seeds them atomically with the field in a single transaction.
    @IsOptional()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => CreateCustomFieldOptionDto)
    options?: CreateCustomFieldOptionDto[];
}
