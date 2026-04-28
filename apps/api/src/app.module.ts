import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CompanyConfigModule } from './company-config/company-config.module';
import { PrismaModule } from './prisma/prisma.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';

@Module({
    imports: [
        EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
        PrismaModule,
        CompanyConfigModule,
        ServiceRequestsModule,
    ],
})
export class AppModule { }
