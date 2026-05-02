import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClientsModule } from './clients/clients.module';
import { CompanyConfigModule } from './company-config/company-config.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProposalsModule } from './proposals/proposals.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';

// NOTE: TasksModule is referenced in the schema (Task / TaskComment models)
// and in permission.defaults.ts but its NestJS module has not been
// implemented yet. The import was previously here and broke `nest build`.
// Re-add this import the moment apps/api/src/tasks/tasks.module.ts lands.

@Module({
    imports: [
        EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
        PrismaModule,
        CompanyConfigModule,
        ServiceRequestsModule,
        ClientsModule,
        ProposalsModule,
    ],
})
export class AppModule { }
