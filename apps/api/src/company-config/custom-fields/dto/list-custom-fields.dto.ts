import { CustomFieldTarget } from '@prisma/client';
import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class ListCustomFieldsDto {
    @IsOptional()
    @IsEnum(CustomFieldTarget)
    target?: CustomFieldTarget;

    // Only valid for target = REQUEST. When provided, the service enforces target = REQUEST
    // unconditionally, so explicit target can be omitted. Providing a conflicting explicit
    // target (e.g. CLIENT + serviceTypeId) results in a 400 error.
    @IsOptional()
    @IsString()
    serviceTypeId?: string;

    // Query params arrive as strings. @Transform converts 'true'/'false' to booleans
    // before @IsBoolean validates. Omitting this param returns all fields regardless of status.
    @IsOptional()
    @Transform(({ value }: { value: unknown }) => {
        if (value === 'true' || value === true) return true;
        if (value === 'false' || value === false) return false;
        return value;
    })
    @IsBoolean()
    isActive?: boolean;
}
