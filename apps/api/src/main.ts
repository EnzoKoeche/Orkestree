import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import 'reflect-metadata';
import { AppModule } from './app.module';
import { FieldFilterInterceptor } from './company-config/permissions/field-filter.interceptor';

async function bootstrap(): Promise<void> {
    const app = await NestFactory.create(AppModule);

    // Global validation pipe: strips unknown properties, whitelist-only.
    app.useGlobalPipes(
        new ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }),
    );

    // Global field filter interceptor (Mechanism B).
    // Resolved from the DI container so future dependencies on FieldFilterInterceptor
    // are injected automatically without changes here.
    app.useGlobalInterceptors(app.get(FieldFilterInterceptor));

    // CORS — opt-in via env. The operator UI at apps/web runs on a different
    // port than the API in dev (3001 vs 3000), so the browser refuses cross-
    // origin XHR without explicit allowance. We do NOT use credentials:true /
    // cookies — auth is Authorization: Bearer ... — so the configuration is
    // intentionally minimal.
    //
    // Set ALLOWED_ORIGINS to a comma-separated list of exact origins (no
    // wildcards, no regex). Empty / unset disables CORS, which is the
    // production default for same-origin deploys.
    const allowedOrigins = (process.env['ALLOWED_ORIGINS'] ?? '')
        .split(',')
        .map((o) => o.trim())
        .filter((o) => o.length > 0);
    if (allowedOrigins.length > 0) {
        app.enableCors({
            origin: allowedOrigins,
            methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'HEAD', 'OPTIONS'],
            allowedHeaders: ['Authorization', 'Content-Type', 'Accept'],
            credentials: false,
            maxAge: 600,
        });
    }

    await app.listen(process.env['PORT'] ?? 3000);
}

bootstrap();
