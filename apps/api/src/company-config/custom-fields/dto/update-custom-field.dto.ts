import { Transform } from 'class-transformer';
import {
    IsBoolean,
    IsInt,
    IsOptional,
    IsString,
    MaxLength,
    Min,
    MinLength,
    ValidateIf,
} from 'class-validator';

export class UpdateCustomFieldDto {
    // code, target, and type are intentionally absent — they are immutable after creation.
    // Changing target or type would require data migration of all associated field values.

    @IsOptional()
    @IsString()
    @MinLength(1)
    @MaxLength(128)
    label?: string;

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

    // Accepts a serviceTypeId string to scope this field to a specific service type,
    // or explicit null to clear scoping (field applies to all requests of any type).
    // Only meaningful when the field's target = REQUEST; enforced at the service layer.
    // @ValidateIf skips @IsString when the value is null so that explicit null passes.
    // @IsOptional skips all validators when the field is absent from the request body.
    @IsOptional()
    @ValidateIf((_, value) => value !== null)
    @IsString()
    @Transform(({ value }: { value: unknown }) => (value === null ? null : value))
    serviceTypeId?: string | null;
}
