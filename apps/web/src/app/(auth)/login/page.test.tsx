import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '@/lib/session';
import LoginPage from './page';

// ─────────────────────────────────────────────────────────────────────────────
// LoginPage spec — RHF + zod inline validation, success redirect, and the
// 4-way HTTP error → toast routing in onSubmit (post-AUDIT-3).
//
// Strategy:
//   - vi.stubGlobal('fetch', …) drives the same-origin POST /api/auth/login
//     response per case (success, 401, 429, network error).
//   - vi.mock('sonner') swaps the toaster so we can assert which error
//     branch fired without a real toast container in the DOM.
//   - vi.mock('@/lib/session') replaces useSession; the page only needs
//     signIn, and we assert it's called on success with { user }.
//   - useRouter comes from the global setup mock — re-importing returns
//     the same stable instance, so we assert on its push directly.
//
// next-intl is mocked globally as an identity translator: t('foo.bar')
// returns the literal key 'foo.bar'. Assertions on toast args use the
// key strings directly, which keeps the spec resilient to copy churn in
// pt.json.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('sonner', () => ({
    toast: {
        error: vi.fn(),
        success: vi.fn(),
        info: vi.fn(),
        warning: vi.fn(),
    },
}));

vi.mock('@/lib/session', () => ({
    useSession: vi.fn(),
}));

const sampleUser = {
    id: 'u1',
    email: 'op@empresa.com',
    firstName: 'Op',
    lastName: 'Erador',
    avatarUrl: null,
};

function makeJsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('LoginPage', () => {
    let signIn: ReturnType<typeof vi.fn>;

    beforeEach(() => {
        signIn = vi.fn();
        // Cast: vi.fn()'s Mock type doesn't structurally match the
        // specific `(s: Session) => void` signatures on
        // SessionContextValue. tsc --noEmit catches the gap; vitest's
        // own transform doesn't, hence the CI-only failure on first run.
        vi.mocked(useSession).mockReturnValue({
            session: null,
            loading: false,
            memberships: [],
            activeMembership: null,
            membershipsLoading: false,
            signIn,
            signOut: vi.fn(),
            setActiveCompany: vi.fn(),
        } as ReturnType<typeof useSession>);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.clearAllMocks();
    });

    it('renders email + password inputs and submit button', () => {
        render(<LoginPage />);

        expect(screen.getByLabelText(/emailLabel/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/passwordLabel/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });

    it('empty submit shows inline errors with role=alert (no toast, no fetch)', async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();
        render(<LoginPage />);

        await user.click(screen.getByRole('button', { name: /submit/i }));

        // Both fields fail the .min(1) rule first; the .email() check on
        // the email field is reached only after a non-empty value.
        const alerts = await screen.findAllByRole('alert');
        expect(alerts).toHaveLength(2);
        expect(alerts[0]).toHaveTextContent('errors.emailRequired');
        expect(alerts[1]).toHaveTextContent('errors.passwordRequired');

        // Validation errors live inline — toast.error must NOT fire for them.
        expect(toast.error).not.toHaveBeenCalled();
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('success: POST /api/auth/login → signIn({ user }) + router.push("/")', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValue(makeJsonResponse(200, { user: sampleUser, expiresIn: '7d' }));
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();
        const router = useRouter();
        render(<LoginPage />);

        await user.type(screen.getByLabelText(/emailLabel/i), '  op@empresa.com  ');
        await user.type(screen.getByLabelText(/passwordLabel/i), 'hunter2');
        await user.click(screen.getByRole('button', { name: /submit/i }));

        await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
        const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
        expect(url).toBe('/api/auth/login');
        expect(init.method).toBe('POST');
        expect(init.credentials).toBe('same-origin');
        // Email is .trim()'d before being sent.
        expect(init.body).toBe(
            JSON.stringify({ email: 'op@empresa.com', password: 'hunter2' }),
        );

        // Response carries no token — provider receives just { user }.
        expect(signIn).toHaveBeenCalledWith({ user: sampleUser });
        expect(router.push).toHaveBeenCalledWith('/');
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('401 → toast.error("errors.invalidCredentials"), no signIn / no navigate', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            makeJsonResponse(401, {
                message: 'Invalid credentials',
                error: 'Unauthorized',
                statusCode: 401,
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();
        render(<LoginPage />);

        await user.type(screen.getByLabelText(/emailLabel/i), 'op@empresa.com');
        await user.type(screen.getByLabelText(/passwordLabel/i), 'wrong');
        await user.click(screen.getByRole('button', { name: /submit/i }));

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('errors.invalidCredentials'),
        );
        expect(signIn).not.toHaveBeenCalled();
    });

    it('429 → toast.error("errors.tooManyAttempts")', async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            makeJsonResponse(429, {
                message: 'Throttled',
                error: 'Too Many Requests',
                statusCode: 429,
            }),
        );
        vi.stubGlobal('fetch', fetchMock);
        const user = userEvent.setup();
        render(<LoginPage />);

        await user.type(screen.getByLabelText(/emailLabel/i), 'op@empresa.com');
        await user.type(screen.getByLabelText(/passwordLabel/i), 'hunter2');
        await user.click(screen.getByRole('button', { name: /submit/i }));

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('errors.tooManyAttempts'),
        );
    });

    it('fetch rejects (network down) → toast.error("errors.networkError")', async () => {
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('network down')));
        const user = userEvent.setup();
        render(<LoginPage />);

        await user.type(screen.getByLabelText(/emailLabel/i), 'op@empresa.com');
        await user.type(screen.getByLabelText(/passwordLabel/i), 'hunter2');
        await user.click(screen.getByRole('button', { name: /submit/i }));

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('errors.networkError'),
        );
    });
});
