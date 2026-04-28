import { Transform } from 'class-transformer';
import {
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
} from 'class-validator';

export class UpdateServiceTypeDto {
    // code is intentionally absent — it is immutable after creation.

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    name?: string;

    @IsOptional()
    @IsString()
    @MaxLength(512)
    description?: string;

    // Accepts a workflowId string to assign a specific workflow,
    // or explicit null to clear the assignment (fall back to company default).
    // @ValidateIf skips @IsString when the value is null so that explicit null
    // passes validation. @IsOptional skips all validators when the field is absent.
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @Transform(({ value }: { value: unknown }) => (value === null ? null : value))
    workflowId?: string | null;

    @IsOptional()
    @IsInt()
    @Min(0)
    sortOrder?: number;
}
