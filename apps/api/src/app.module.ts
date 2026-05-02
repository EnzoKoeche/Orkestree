import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClientsModule } from './clients/clients.module';
import { CompanyConfigModule } from './company-config/company-config.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProposalsModule } from './proposals/proposals.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { TasksModule } from './tasks/tasks.module';

@Module({
    imports: [
        EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
        PrismaModule,
        CompanyConfigModule,
        ServiceRequestsModule,
        ClientsModule,
        TasksModule,
        ProposalsModule,
    ],
})
export class AppModule { }
