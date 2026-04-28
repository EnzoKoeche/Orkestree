import {
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

const VALUE_PATTERN = /^[a-z][a-z0-9_]*$/;
const VALUE_MESSAGE =
    'value must be snake_case (lowercase letters, digits, underscores; must start with a letter)';

export class CreateCustomFieldOptionDto {
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    label: string;

    // Immutable after creation — referenced in automation rule conditions
    // as dot-notation values (e.g. request.fields.priority = "high").
    @IsString()
    @MinLength(1)
    @MaxLength(64)
    @Matches(VALUE_PATTERN, { message: VALUE_MESSAGE })
    value: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}
