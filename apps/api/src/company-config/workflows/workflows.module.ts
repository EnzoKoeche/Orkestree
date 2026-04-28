import { Module } from '@nestjs/common';
import { ConfigAuditModule } from '../audit/config-audit.module';
import { WorkflowsController } from './workflows.controller';
import { WorkflowsService } from './workflows.service';

@Module({
    imports: [ConfigAuditModule],
    controllers: [WorkflowsController],
    providers: [WorkflowsService],
    exports: [WorkflowsService],
})
export class WorkflowsModule { }
