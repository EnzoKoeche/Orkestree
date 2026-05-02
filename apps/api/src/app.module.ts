import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ClientsModule } from './clients/clients.module';
import { CompanyConfigModule } from './company-config/company-config.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProposalJobsModule } from './proposals/jobs/proposal-jobs.module';
import { ProposalPdfModule } from './proposals/pdf/proposal-pdf.module';
import { ProposalsModule } from './proposals/proposals.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';

// NOTE: TasksModule is referenced in the schema (Task / TaskComment models)
// and in permission.defaults.ts but its NestJS module has not been
// implemented yet. The import was previously here and broke `nest build`.
// Re-add this import the moment apps/api/src/tasks/tasks.module.ts lands.

// BullMQ root connection. Parsed from REDIS_URL so the same env var that
// drives the permission cache also drives the job queue. Sub-modules call
// BullModule.registerQueue(...) to declare individual queues; they inherit
// this connection without re-declaring it.
function parseRedisUrl(url: string): { host: string; port: number; password?: string } {
    const parsed = new URL(url);
    return {
        host: parsed.hostname,
        port: Number.parseInt(parsed.port || '6379', 10),
        password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
    };
}

@Module({
    imports: [
        EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
        BullModule.forRootAsync({
            useFactory: () => ({
                connection: parseRedisUrl(process.env['REDIS_URL'] ?? 'redis://localhost:6379'),
            }),
        }),
        PrismaModule,
        CompanyConfigModule,
        ServiceRequestsModule,
        ClientsModule,
        ProposalsModule,
        ProposalJobsModule,
        ProposalPdfModule,
    ],
})
export class AppModule { }
