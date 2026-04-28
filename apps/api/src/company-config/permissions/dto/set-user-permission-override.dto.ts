import { CompanyResource, PermissionAction } from '@prisma/client';
import { IsBoolean, IsEnum, IsString } from 'class-validator';

export class SetUserPermissionOverrideDto {
    @IsString()
    membershipId: string;

    @IsEnum(CompanyResource)
    resource: CompanyResource;

    @IsEnum(PermissionAction)
    action: PermissionAction;

    @IsBoolean()
    allowed: boolean;
}
