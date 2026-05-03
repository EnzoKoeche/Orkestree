import { Module } from '@nestjs/common';
import { MembershipsController } from './memberships.controller';

// ─────────────────────────────────────────────────────────────────────────────
// MembershipsModule
//
// Hosts the `/memberships/me` bootstrap endpoint. Intentionally tiny:
//   - PrismaService is provided globally (PrismaModule is @Global()).
//   - JwtAuthGuard / JwtStrategy come from AuthModule (also @Global()).
// So no extra imports are required here.
//
// If membership-management endpoints (invite, revoke, change role) land
// later, they belong in this module too — but those are explicitly out of
// scope for the auth-bootstrap phase.
// ─────────────────────────────────────────────────────────────────────────────

@Module({
    controllers: [MembershipsController],
})
export class MembershipsModule { }
