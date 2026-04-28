import { Injectable } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { PermissionResolverService } from './permission-resolver.service';

// ─────────────────────────────────────────────────────────────────────────────
// PermissionCacheInvalidationListener
//
// Listens for config.permission.changed events and invalidates Redis cache.
// The event is fired post-commit by PermissionsService after any permission
// change. On the receiving instance, relevant Redis keys are deleted.
// Other instances experience a cache miss on the next request and re-resolve
// from DB. Maximum stale window = Redis TTL (5 minutes).
//
// Note: this in-process event approach is correct for single-instance and
// low-latency-tolerance multi-instance deployments within the 5-minute TTL.
// Deferred: Redis pub/sub for sub-TTL cross-instance propagation if SLA demands it.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class PermissionCacheInvalidationListener {
    constructor(private readonly permissionResolver: PermissionResolverService) { }

    @OnEvent('config.permission.changed')
    async handlePermissionChanged(payload: {
        companyId: string;
        membershipId?: string;
    }): Promise<void> {
        if (payload.membershipId) {
            await this.permissionResolver.invalidateForMembership(
                payload.companyId,
                payload.membershipId,
            );
        } else {
            await this.permissionResolver.invalidateForCompany(payload.companyId);
        }
    }
}
