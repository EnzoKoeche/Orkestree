import {
    IsBoolean,
    IsHexColor,
    IsInt,
    IsOptional,
    IsString,
    Matches,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';

const CODE_PATTERN = /^[a-z][a-z0-9_]*$/;
const CODE_MESSAGE = 'code must be snake_case';

export class CreateWorkflowStageDto {
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
    @IsHexColor()
    color?: string;

    @IsInt()
    @Min(0)
    sortOrder: number;

    @IsOptional()
    @IsBoolean()
    isInitial?: boolean;

    @IsOptional()
    @IsBoolean()
    isFinal?: boolean;
}

export class UpdateWorkflowStageDto {
    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(512)
    description?: string;

    @IsOptional()
    @IsHexColor()
    color?: string;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;

    @IsOptional()
    @IsBoolean()
    isFinal?: boolean;
}

export class ReorderStagesDto {
    // Array of { id, sortOrder } pairs
    @IsString({ each: true })
    stageIds: string[];
}
