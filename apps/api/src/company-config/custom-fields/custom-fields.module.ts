import { Module } from '@nestjs/common';
import { ConfigAuditModule } from '../audit/config-audit.module';
import { CustomFieldsController } from './custom-fields.controller';
import { CustomFieldsService } from './custom-fields.service';

@Module({
    imports: [ConfigAuditModule],
    controllers: [CustomFieldsController],
    providers: [CustomFieldsService],
    // Exported so future modules (e.g. request intake) can load active fields
    // for a given target/serviceType without duplicating query logic.
    exports: [CustomFieldsService],
})
export class CustomFieldsModule { }
