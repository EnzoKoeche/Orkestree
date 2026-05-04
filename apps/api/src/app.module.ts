import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { RedisModule } from '@nestjs-modules/ioredis';
import { AuthModule } from './auth/auth.module';
import { ClientsModule } from './clients/clients.module';
import { CompanyConfigModule } from './company-config/company-config.module';
import { MembershipsModule } from './memberships/memberships.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProposalsModule } from './proposals/proposals.module';
import { ServiceRequestsModule } from './service-requests/service-requests.module';
import { TasksModule } from './tasks/tasks.module';

// Throttler is wired here once, globally. Default is intentionally permissive
// (60/min) so this guard never silently bites tenant-scoped routes. Per-route
// @Throttle overrides tighten the policy where it actually matters (e.g. the
// 5/60s cap on /auth/login lives on AuthController so reviewers see it next
// to the route).
//
// Storage is in-memory — correct for single-process dev. Production with
// multiple API replicas needs ThrottlerStorageRedisService backed by
// REDIS_URL. Tracked separately as a follow-up task in Notion.
//
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
        // Infrastructure
        // ConfigModule MUST be first: it populates process.env from .env, and
        // the factories below (RedisModule.forRoot reading REDIS_URL,
        // JwtModule reading JWT_SECRET, etc.) execute in this order — without
        // .env loaded first they read undefined values and either crash on
        // boot (JwtStrategy refuses JWT_SECRET < 16 chars) or silently fall
        // back to localhost defaults that mask config errors.
        ConfigModule.forRoot({
            isGlobal: true,
            envFilePath: ['.env'],
            cache: true,
        }),
        EventEmitterModule.forRoot({ wildcard: false, maxListeners: 20 }),
        ThrottlerModule.forRoot([
            {
                name: 'default',
                ttl: 60_000,
                limit: 60,
            },
        ]),
        RedisModule.forRoot({
            type: 'single',
            url: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
        }),
        PrismaModule,
        // Identity / cross-cutting
        AuthModule,
        // Domain
        CompanyConfigModule,
        MembershipsModule,
        ServiceRequestsModule,
        ClientsModule,
        TasksModule,
        ProposalsModule,
    ],
    providers: [
        {
            provide: APP_GUARD,
            useClass: ThrottlerGuard,
        },
    ],
})
export class AppModule { }
