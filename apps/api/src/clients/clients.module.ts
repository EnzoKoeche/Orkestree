import { Module } from '@nestjs/common';
import { ConfigAuditModule } from '../company-config/audit/config-audit.module';
import { ClientFieldValuesService } from './client-field-values.service';
import { ClientsController } from './clients.controller';
import { ClientsService } from './clients.service';

@Module({
    imports: [ConfigAuditModule],
    controllers: [ClientsController],
    providers: [ClientsService, ClientFieldValuesService],
    exports: [ClientsService],
})
export class ClientsModule { }
