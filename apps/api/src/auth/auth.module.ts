import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';

// ─────────────────────────────────────────────────────────────────────────────
// AuthModule
//
// Owns:
//   - JwtModule registration (secret + expiry pulled from env)
//   - JwtStrategy (the passport piece JwtAuthGuard already extends)
//   - AuthService / AuthController (login + whoami)
//
// Marked @Global() so JwtAuthGuard (which is referenced from every domain
// controller) does not need to import this module everywhere. The guard
// itself only depends on @nestjs/passport's AuthGuard('jwt') runtime, which
// resolves to whichever strategy is registered against that name — that
// happens here, once.
//
// We deliberately do NOT register JwtAuthGuard as APP_GUARD: keeping it
// per-controller via @UseGuards preserves the existing pattern (used by
// proposals, clients, service-requests, proposal-pdf) and avoids breaking
// the public sign-in route.
// ─────────────────────────────────────────────────────────────────────────────

function loadJwtSecret(): string {
    const secret = process.env['JWT_SECRET'];
    if (!secret || secret.length < 16) {
        throw new Error(
            'JWT_SECRET is missing or too short (need at least 16 chars). ' +
                'Refusing to start: an unconfigured signing key is unsafe.',
        );
    }
    return secret;
}

@Global()
@Module({
    imports: [
        PassportModule.register({ defaultStrategy: 'jwt', session: false }),
        JwtModule.registerAsync({
            useFactory: () => ({
                secret: loadJwtSecret(),
                signOptions: {
                    expiresIn: process.env['JWT_EXPIRES_IN'] ?? '7d',
                },
            }),
        }),
    ],
    controllers: [AuthController],
    providers: [AuthService, JwtStrategy],
    exports: [AuthService, JwtModule, PassportModule],
})
export class AuthModule { }
