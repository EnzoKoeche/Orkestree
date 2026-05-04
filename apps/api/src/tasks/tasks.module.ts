import { Module } from '@nestjs/common';
import { ConfigAuditModule } from '../company-config/audit/config-audit.module';
import { TaskCommentsService } from './task-comments.service';
import { TasksController } from './tasks.controller';
import { TasksService } from './tasks.service';

@Module({
    imports: [ConfigAuditModule],
    controllers: [TasksController],
    providers: [TasksService, TaskCommentsService],
    exports: [TasksService],
})
export class TasksModule { }
