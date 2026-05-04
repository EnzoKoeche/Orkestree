import { Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RedisModule } from '@nestjs-modules/ioredis';
import { ClientsModule } from './clients/clients.module';
import { CompanyConfigModule } from './company-config/company-config.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProposalsModule } from './proposals/proposals.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { TasksModule } from './tasks/tasks.module';

// Redis is the backing store for PermissionResolverService's permission +
// field-access cache (see company-config/permissions/permission-resolver.service.ts,
// which uses @InjectRedis()). Without this registration the API boots but
// crashes on the first tenant-scoped request when DI fails to resolve the
// Redis client.
//
// REDIS_URL is read at boot. We default to redis://localhost:6379 only so
// that `tsc` and offline tooling don't crash; in any real environment the
// env var must be set explicitly. ioredis itself will fail loud on first
// command if the URL is unreachable, which is the right failure mode.
@Module({
    imports: [
        EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
        RedisModule.forRoot({
            type: 'single',
            url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        }),
        PrismaModule,
        CompanyConfigModule,
        ServiceRequestsModule,
        ClientsModule,
        TasksModule,
        ProposalsModule,
    ],
})
export class AppModule { }
