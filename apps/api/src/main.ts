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

    await app.listen(process.env['PORT'] ?? 3000);
}

bootstrap();
