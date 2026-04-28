import {
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
const CODE_MESSAGE = 'code must be snake_case (lowercase letters, digits, underscores; must start with a letter)';

export class CreateServiceTypeDto {
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

    // null → runtime-resolve to company default workflow when a Request is created.
    @IsOptional()
    @IsString()
    workflowId?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}
