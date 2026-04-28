import { Global, Module } from '@nestjs/common';
import { ConfigAuditModule } from '../audit/config-audit.module';
import { FieldFilterInterceptor } from './field-filter.interceptor';
import { PermissionCacheInvalidationListener } from './permission-cache-invalidation.listener';
import { PermissionResolverService } from './permission-resolver.service';
import { PermissionsController } from './permissions.controller';
import { PermissionsService } from './permissions.service';

@Global()
@Module({
    imports: [ConfigAuditModule],
    controllers: [PermissionsController],
    providers: [PermissionResolverService, PermissionsService, FieldFilterInterceptor, PermissionCacheInvalidationListener],
    exports: [PermissionResolverService, FieldFilterInterceptor],
})
export class PermissionsModule { }
