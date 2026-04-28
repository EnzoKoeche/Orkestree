import { SetMetadata } from '@nestjs/common';
import { CompanyResource, PermissionAction } from '@prisma/client';

export const PERMISSION_KEY = 'required_permission';

export const RequirePermission = (resource: CompanyResource, action: PermissionAction) =>
    SetMetadata(PERMISSION_KEY, { resource, action });
