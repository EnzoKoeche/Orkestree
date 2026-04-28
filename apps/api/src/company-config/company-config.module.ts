import { Module } from '@nestjs/common';
import { ConfigAuditModule } from './audit/config-audit.module';
import { PermissionsModule } from './permissions/permissions.module';
import { ServiceTypesModule } from './service-types/service-types.module';
import { WorkflowsModule } from './workflows/workflows.module';

@Module({
    imports: [
        ConfigAuditModule,
        PermissionsModule,
        WorkflowsModule,
        ServiceTypesModule,
    ],
    exports: [
        PermissionsModule,
        WorkflowsModule,
        ServiceTypesModule,
    ],
})
export class CompanyConfigModule { }
