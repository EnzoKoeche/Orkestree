import { CompanyResource, PermissionAction, Role } from '@prisma/client';
import { IsBoolean, IsEnum } from 'class-validator';

export class SetRolePermissionDto {
    @IsEnum(Role)
    role: Role;

    @IsEnum(CompanyResource)
    resource: CompanyResource;

    @IsEnum(PermissionAction)
    action: PermissionAction;

    @IsBoolean()
    allowed: boolean;
}
