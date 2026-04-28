import { Module } from '@nestjs/common';
import { ConfigAuditService } from './config-audit.service';

@Module({
    providers: [ConfigAuditService],
    exports: [ConfigAuditService],
})
export class ConfigAuditModule { }
