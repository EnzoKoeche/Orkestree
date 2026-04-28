import { Role, SensitiveField } from '@prisma/client';
import { IsBoolean, IsEnum, IsString } from 'class-validator';

export class SetRoleFieldPermissionDto {
    @IsEnum(Role)
    role: Role;

    @IsEnum(SensitiveField)
    field: SensitiveField;

    @IsBoolean()
    allowed: boolean;
}

export class SetUserFieldPermissionOverrideDto {
    @IsString()
    membershipId: string;

    @IsEnum(SensitiveField)
    field: SensitiveField;

    @IsBoolean()
    allowed: boolean;
}
