'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field, Input } from '@/components/ui/Input';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';

// ─────────────────────────────────────────────────────────────────────────────
// Sign-in
//
// Real email + password form wired to POST /auth/login. On success, the
// SessionProvider bootstraps /memberships/me and the user lands on
// /requests (or the no-workspaces panel inside the shell if their account
// has no ACTIVE memberships).
//
// The form does not branch on "wrong email" vs "wrong password": the
// backend returns a single opaque 401 to avoid user enumeration. We mirror
// that on the client.
// ─────────────────────────────────────────────────────────────────────────────

export default function SignInPage() {
    const router = useRouter();
    const { snapshot, signIn } = useSession();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    // If the session bootstraps to authenticated (e.g. user already had a
    // valid token in localStorage), bounce out of /sign-in.
    useEffect(() => {
        if (snapshot.phase === 'authenticated') {
            router.replace('/requests');
        }
    }, [snapshot.phase, router]);

    async function onSubmit(e: FormEvent) {
        e.preventDefault();
        setError(null);
        const e1 = email.trim();
        const p1 = password;
        if (!e1 || !p1) {
            setError('Email and password are required.');
            return;
        }
        setBusy(true);
        try {
            await signIn(e1, p1);
            // Navigation is handled by the effect above as soon as the
            // snapshot flips to `authenticated`.
        } catch (err) {
            if (err instanceof ApiError) {
                if (err.status === 401) {
                    setError('Invalid email or password.');
                } else if (err.status === 400) {
                    setError(err.toUserMessage());
                } else if (err.status === 0 || err.status >= 500) {
                    setError(
                        'The server is unavailable right now. Please try again in a moment.',
                    );
                } else {
                    setError(err.toUserMessage());
                }
            } else {
                setError('Sign-in failed. Please try again.');
            }
        } finally {
            setBusy(false);
        }
    }

    const banner =
        snapshot.phase === 'no-workspaces' ? (
            <p className="rounded-md border border-amber-200 bg-state-warning-bg px-3 py-2 text-sm text-state-warning">
                Your last sign-in succeeded but your account has no active workspaces.
                Sign in again with a different account, or ask an administrator to
                invite you.
            </p>
        ) : null;

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
                        title="Sign in"
                        description="Operator console. Use the email and password your administrator gave you."
                    />
                    <form onSubmit={onSubmit} noValidate>
                        <Card.Body>
                            <div className="flex flex-col gap-4">
                                {banner}
                                <Field label="Email" htmlFor="email">
                                    <Input
                                        id="email"
                                        type="email"
                                        value={email}
                                        onChange={(e) => setEmail(e.target.value)}
                                        autoComplete="email"
                                        spellCheck={false}
                                        required
                                        disabled={busy}
                                    />
                                </Field>
                                <Field label="Password" htmlFor="password">
                                    <Input
                                        id="password"
                                        type="password"
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        autoComplete="current-password"
                                        required
                                        disabled={busy}
                                    />
                                </Field>
                                {error ? (
                                    <p
                                        role="alert"
                                        className="rounded-md border border-red-200 bg-state-danger-bg px-3 py-2 text-sm text-state-danger"
                                    >
                                        {error}
                                    </p>
                                ) : null}
                            </div>
                        </Card.Body>
                        <Card.Footer>
                            <Button type="submit" variant="primary" loading={busy}>
                                Sign in
                            </Button>
                        </Card.Footer>
                    </form>
                </Card>
                <p className="mt-4 text-center text-xs text-ink-subtle">
                    Forgot your password? Contact your workspace administrator —
                    self-serve recovery is not yet available.
                </p>
            </div>
        </div>
    );
}
