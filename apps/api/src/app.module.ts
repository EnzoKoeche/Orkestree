import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { CompanyConfigModule } from './company-config/company-config.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
    imports: [
        EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
        PrismaModule,
        CompanyConfigModule,
    ],
})
export class AppModule { }
