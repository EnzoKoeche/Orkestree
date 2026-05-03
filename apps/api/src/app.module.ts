import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CompanyConfigModule } from './company-config/company-config.module';
import { MembershipsModule } from './memberships/memberships.module';
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

// Throttler is wired here — once, globally — and the @SkipThrottle() decorator
// is used to opt-out everywhere we don't want it (i.e. everywhere except the
// login endpoint). Going the other way (per-route @Throttle) is just as valid
// but spreads rate-limit config across many controllers; we prefer one switch
// and one default. The actual ceiling for /auth/login lives on the controller
// (5 req / 60s / IP) so reviewers see the policy next to the route.
//
// Default ceiling below is intentionally permissive (60/min) so this guard
// never silently bites tenant-scoped routes. The opt-in (@Throttle override)
// on AuthController.login() is the only enforced limit that matters today.
@Module({
    imports: [
        EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
        ThrottlerModule.forRoot([
            {
                name: 'default',
                ttl: 60_000, // 60s window
                limit: 60,   // generous global default; per-route overrides tighten
            },
        ]),
        BullModule.forRootAsync({
            useFactory: () => ({
                connection: parseRedisUrl(process.env['REDIS_URL'] ?? 'redis://localhost:6379'),
            }),
        }),
        PrismaModule,
        AuthModule,
        CompanyConfigModule,
        MembershipsModule,
        ServiceRequestsModule,
        ClientsModule,
        ProposalsModule,
        ProposalJobsModule,
        ProposalPdfModule,
    ],
    providers: [
        // Global ThrottlerGuard. By default uses the in-memory store, which
        // is correct for single-process dev; in production with multiple
        // API replicas, swap the storage to ThrottlerStorageRedisService
        // backed by REDIS_URL. Out of scope for this PR.
        { provide: APP_GUARD, useClass: ThrottlerGuard },
    ],
})
export class AppModule { }
