import {
    CallHandler,
    ExecutionContext,
    Injectable,
    NestInterceptor,
} from '@nestjs/common';
import { CompanyMembership } from '@prisma/client';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { PermissionResolverService } from './permission-resolver.service';
import { SENSITIVE_FIELD_REGISTRY } from './sensitive-field.registry';

// ─────────────────────────────────────────────────────────────────────────────
// FieldFilterInterceptor — Mechanism B (defense-in-depth)
//
// Strips sensitive fields from every outgoing response object based on the
// central SENSITIVE_FIELD_REGISTRY. No per-DTO registration needed.
//
// Works in tandem with Mechanism A (Prisma select scoped by RoleCategory).
// Mechanism A prevents sensitive data from being fetched.
// Mechanism B catches any data that bypasses Mechanism A through a bug or
// a missing select scope.
//
// The interceptor is registered globally in AppModule.
// It reads the CompanyMembership attached to the request by CompanyMemberGuard.
// If no membership is present (public endpoints), it strips all sensitive fields.
// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class FieldFilterInterceptor implements NestInterceptor {
    constructor(private readonly permissionResolver: PermissionResolverService) { }

    intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
        const request = context.switchToHttp().getRequest<{
            companyMembership?: Pick<CompanyMembership, 'id' | 'companyId' | 'role'>;
        }>();
        const membership = request.companyMembership;

        return next.handle().pipe(
            map(async (data: unknown) => {
                return this.filterFields(data, membership);
            }),
        );
    }

    private async filterFields(
        data: unknown,
        membership: Pick<CompanyMembership, 'id' | 'companyId' | 'role'> | undefined,
    ): Promise<unknown> {
        if (data === null || data === undefined) return data;

        if (Array.isArray(data)) {
            return Promise.all(data.map((item) => this.filterFields(item, membership)));
        }

        if (typeof data === 'object') {
            const result: Record<string, unknown> = {};
            const entries = Object.entries(data as Record<string, unknown>);

            await Promise.all(
                entries.map(async ([key, value]) => {
                    const sensitiveField = SENSITIVE_FIELD_REGISTRY[key];
                    if (sensitiveField !== undefined) {
                        if (!membership) return; // no membership = strip all sensitive fields
                        const allowed = await this.permissionResolver.canSeeField(
                            membership,
                            sensitiveField,
                        );
                        if (!allowed) return; // strip the field
                    }
                    result[key] = await this.filterFields(value, membership);
                }),
            );

            return result;
        }

        return data;
    }
}
