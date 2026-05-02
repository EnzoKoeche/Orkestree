'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Field, Input, Select } from '@/components/ui/Input';
import { Card } from '@/components/ui/Card';
import { useSession } from '@/lib/session';
import { Role } from '@/types/domain';

// ─────────────────────────────────────────────────────────────────────────────
// Sign-in (token-paste mode)
//
// IMPORTANT: There is no /auth/login endpoint in the backend yet. The
// JwtAuthGuard exists but no JwtStrategy / AuthController is registered (see
// apps/api/src/auth/* — only the guards / decorators ship today). Until that
// lands, the operator pastes a JWT they obtained out-of-band and the company
// id they want to enter as. The backend re-validates everything server-side
// on every request, so a wrong / forged token simply fails 401 / 403.
//
// When a real auth module ships, this page evolves into an email + password
// form that calls POST /auth/login and stores the returned token via the
// same useSession().signIn(...) call. The rest of the app keeps working
// without changes.
// ─────────────────────────────────────────────────────────────────────────────

const ROLES: Role[] = ['OWNER', 'ADMIN', 'FINANCEIRO', 'OPERACIONAL', 'CLIENTE'];

export default function SignInPage() {
    const router = useRouter();
    const { session, signIn, loading } = useSession();

    const [token, setToken] = useState('');
    const [companyId, setCompanyId] = useState('');
    const [role, setRole] = useState<Role | ''>('');
    const [workspaceLabel, setWorkspaceLabel] = useState('');
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!loading && session) {
            router.replace('/requests');
        }
    }, [loading, session, router]);

    function onSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        const t = token.trim();
        const c = companyId.trim();
        if (!t || !c) {
            setError('Both token and company ID are required.');
            return;
        }
        signIn({
            token: t,
            companyId: c,
            role: role === '' ? null : role,
            workspaceLabel: workspaceLabel.trim() || null,
        });
        router.replace('/requests');
    }

    return (
        <div className="flex min-h-screen items-center justify-center bg-surface-canvas px-4 py-10">
            <div className="w-full max-w-md">
                <div className="mb-6 flex items-center gap-2">
                    <span className="inline-block h-7 w-7 rounded-md bg-accent" aria-hidden />
                    <span className="text-base font-semibold tracking-tight text-ink">
                        Orkestree
                    </span>
                </div>
                <Card>
                    <Card.Header
                        title="Enter workspace"
                        description="Authentication module not yet shipped. Paste a JWT and the workspace ID to continue. The backend re-validates both on every request."
                    />
                    <form onSubmit={onSubmit}>
                        <Card.Body>
                            <div className="flex flex-col gap-4">
                                <Field label="JWT token" htmlFor="token">
                                    <textarea
                                        id="token"
                                        value={token}
                                        onChange={(e) => setToken(e.target.value)}
                                        rows={3}
                                        className="w-full rounded-md border border-border bg-surface-base px-3 py-2 font-mono text-xs text-ink placeholder:text-ink-faint focus-ring"
                                        placeholder="eyJhbGciOi…"
                                        autoComplete="off"
                                        spellCheck={false}
                                    />
                                </Field>
                                <Field label="Company ID" htmlFor="companyId">
                                    <Input
                                        id="companyId"
                                        value={companyId}
                                        onChange={(e) => setCompanyId(e.target.value)}
                                        placeholder="cmp_…"
                                        autoComplete="off"
                                        spellCheck={false}
                                    />
                                </Field>
                                <Field
                                    label="Workspace label (optional)"
                                    htmlFor="workspace"
                                    helper="Cosmetic only — shown in the header and sidebar."
                                >
                                    <Input
                                        id="workspace"
                                        value={workspaceLabel}
                                        onChange={(e) => setWorkspaceLabel(e.target.value)}
                                        placeholder="Acme Co."
                                    />
                                </Field>
                                <Field
                                    label="Role hint (optional)"
                                    htmlFor="role"
                                    helper="UI-only hint. Server enforces real permissions."
                                >
                                    <Select
                                        id="role"
                                        value={role}
                                        onChange={(e) => setRole(e.target.value as Role | '')}
                                    >
                                        <option value="">Unknown</option>
                                        {ROLES.map((r) => (
                                            <option key={r} value={r}>
                                                {r}
                                            </option>
                                        ))}
                                    </Select>
                                </Field>
                                {error ? (
                                    <p className="rounded-md border border-red-200 bg-state-danger-bg px-3 py-2 text-sm text-state-danger">
                                        {error}
                                    </p>
                                ) : null}
                            </div>
                        </Card.Body>
                        <Card.Footer>
                            <Button type="submit" variant="primary">
                                Continue
                            </Button>
                        </Card.Footer>
                    </form>
                </Card>
                <p className="mt-4 text-center text-xs text-ink-subtle">
                    The token is stored in this browser only (localStorage) and is sent on every API
                    request as <code className="font-mono">Authorization: Bearer …</code>.
                </p>
            </div>
        </div>
    );
}
