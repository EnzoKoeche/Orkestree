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

    // CORS — required for browser clients (the @orkestree/web Next.js app at
    // localhost:3001). curl/Postman bypass CORS, which is why this stayed
    // hidden until the first browser-driven smoke. WEB_ORIGIN comes from env
    // so prod can pin to the deployed frontend domain (e.g.
    // https://app.orkestree.com.br) without code changes; the localhost
    // fallback keeps a fresh `pnpm dev` working out of the box.
    //
    // credentials: true is set ahead of the cookie-based auth migration on
    // the frontend roadmap (HttpOnly cookie via Route Handler — see Notion
    // follow-up). Today the Authorization: Bearer header is the only
    // credential the browser sends, so this is forward-looking, not
    // load-bearing.
    app.enableCors({
        origin: process.env['WEB_ORIGIN'] ?? 'http://localhost:3001',
        credentials: true,
        methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
    });

    await app.listen(process.env['PORT'] ?? 3000);
}

bootstrap();
