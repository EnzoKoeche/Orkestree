import { Module } from '@nestjs/common';
import { ConfigAuditModule } from '../company-config/audit/config-audit.module';
import { FieldValuesService } from './field-values.service';
import { ServiceRequestsController } from './service-requests.controller';
import { ServiceRequestsService } from './service-requests.service';
import { StageTransitionsService } from './stage-transitions.service';

@Module({
    imports: [ConfigAuditModule],
    controllers: [ServiceRequestsController],
    providers: [ServiceRequestsService, StageTransitionsService, FieldValuesService],
    exports: [ServiceRequestsService],
})
export class ServiceRequestsModule { }
