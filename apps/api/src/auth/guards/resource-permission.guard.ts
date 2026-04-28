import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { CompanyMembership, CompanyResource, PermissionAction } from '@prisma/client';
import { PermissionResolverService } from '../../company-config/permissions/permission-resolver.service';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';

@Injectable()
export class ResourcePermissionGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly permissionResolver: PermissionResolverService,
    ) { }

    async canActivate(context: ExecutionContext): Promise<boolean> {
        const required = this.reflector.getAllAndOverride<
            { resource: CompanyResource; action: PermissionAction } | undefined
        >(PERMISSION_KEY, [context.getHandler(), context.getClass()]);

        // If no @RequirePermission decorator, guard is not enforced at this level.
        if (!required) return true;

        const request = context.switchToHttp().getRequest<{
            companyMembership?: Pick<CompanyMembership, 'id' | 'companyId' | 'role'>;
        }>();

        const membership = request.companyMembership;
        if (!membership) {
            throw new ForbiddenException('Company membership context not resolved.');
        }

        const allowed = await this.permissionResolver.isAllowed(
            membership,
            required.resource,
            required.action,
        );

        if (!allowed) {
            throw new ForbiddenException(
                `Insufficient permissions: ${required.resource}.${required.action}`,
            );
        }

        return true;
    }
}
