import {
    IsBoolean,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    MinLength,
} from 'class-validator';

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
const CODE_MESSAGE = 'code must be snake_case (lowercase letters, digits, underscores; must start with a letter)';

export class CreateWorkflowDto {
    @IsString()
    @MinLength(2)
    @MaxLength(64)
    @Matches(CODE_PATTERN, { message: CODE_MESSAGE })
    code: string;

    @IsString()
    @MinLength(1)
    @MaxLength(128)
    name: string;

    @IsOptional()
    @IsString()
    @MaxLength(512)
    description?: string;

    @IsOptional()
    @IsBoolean()
    isDefault?: boolean;
}

export class UpdateWorkflowDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(512)
    description?: string;
}
