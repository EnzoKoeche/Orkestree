import { Module } from '@nestjs/common';
import { ConfigAuditModule } from '../audit/config-audit.module';
import { ServiceTypesController } from './service-types.controller';
import { ServiceTypesService } from './service-types.service';

@Module({
    imports: [ConfigAuditModule],
    controllers: [ServiceTypesController],
    providers: [ServiceTypesService],
    exports: [ServiceTypesService],
})
export class ServiceTypesModule { }
