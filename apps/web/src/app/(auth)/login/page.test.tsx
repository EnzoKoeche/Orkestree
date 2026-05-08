import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '@/lib/api';
import { ApiError } from '@/lib/http';
import { useSession } from '@/lib/session';
import LoginPage from './page';

// ─────────────────────────────────────────────────────────────────────────────
// LoginPage spec — RHF + zod inline validation, success redirect, and the
// 4-way ApiError → toast routing in the catch block (page.tsx:79-93).
//
// Strategy:
//   - vi.mock('@/lib/api') swaps authApi.login for a vi.fn so each case
//     drives the wire response (success, 401, 429, isNetworkError).
//   - vi.mock('sonner') swaps the toaster so we can assert which error
//     branch fired without a real toast container in the DOM.
//   - vi.mock('@/lib/session') replaces useSession; the page only needs
//     signIn here, and we assert it's called on success.
//   - useRouter comes from the global setup mock — re-importing returns
//     the same stable instance, so we assert on its push directly.
//
// next-intl is mocked globally as an identity translator: t('foo.bar')
// returns the literal key 'foo.bar'. Assertions on toast args use the
// key strings directly, which keeps the spec resilient to copy changes
// in pt.json (a copy churn shouldn't break the routing test).
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/api', () => ({
    authApi: {
        login: vi.fn(),
    },
}));

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

const sampleLoginResponse = {
    accessToken: 'jwt.token.value',
    expiresIn: '7d',
    user: {
        id: 'u1',
        email: 'op@empresa.com',
        firstName: 'Op',
        lastName: 'Erador',
        avatarUrl: null,
    },
};

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
        vi.clearAllMocks();
    });

    it('renders email + password inputs and submit button', () => {
        render(<LoginPage />);

        expect(screen.getByLabelText(/emailLabel/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/passwordLabel/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument();
    });

    it('empty submit shows inline errors with role=alert (no toast)', async () => {
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
        expect(authApi.login).not.toHaveBeenCalled();
    });

    it('successful login: calls authApi.login, signIn, and router.push("/")', async () => {
        vi.mocked(authApi.login).mockResolvedValue(sampleLoginResponse);
        const user = userEvent.setup();
        const router = useRouter();
        render(<LoginPage />);

        await user.type(screen.getByLabelText(/emailLabel/i), '  op@empresa.com  ');
        await user.type(screen.getByLabelText(/passwordLabel/i), 'hunter2');
        await user.click(screen.getByRole('button', { name: /submit/i }));

        // Email is .trim()'d before being passed to the API.
        await waitFor(() =>
            expect(authApi.login).toHaveBeenCalledWith('op@empresa.com', 'hunter2'),
        );
        expect(signIn).toHaveBeenCalledWith({
            token: sampleLoginResponse.accessToken,
            user: sampleLoginResponse.user,
        });
        expect(router.push).toHaveBeenCalledWith('/');
        expect(toast.error).not.toHaveBeenCalled();
    });

    it('ApiError 401 → toast.error("errors.invalidCredentials")', async () => {
        vi.mocked(authApi.login).mockRejectedValue(
            new ApiError('Unauthorized', 401, {
                message: 'Invalid credentials',
                error: 'Unauthorized',
            }),
        );
        const user = userEvent.setup();
        render(<LoginPage />);

        await user.type(screen.getByLabelText(/emailLabel/i), 'op@empresa.com');
        await user.type(screen.getByLabelText(/passwordLabel/i), 'wrong');
        await user.click(screen.getByRole('button', { name: /submit/i }));

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('errors.invalidCredentials'),
        );
        // signIn / router.push must NOT fire on auth failure.
        expect(signIn).not.toHaveBeenCalled();
    });

    it('ApiError 429 → toast.error("errors.tooManyAttempts")', async () => {
        vi.mocked(authApi.login).mockRejectedValue(
            new ApiError(
                'Too many requests',
                429,
                { message: 'Throttled', error: 'Too Many Requests' },
                7,
            ),
        );
        const user = userEvent.setup();
        render(<LoginPage />);

        await user.type(screen.getByLabelText(/emailLabel/i), 'op@empresa.com');
        await user.type(screen.getByLabelText(/passwordLabel/i), 'hunter2');
        await user.click(screen.getByRole('button', { name: /submit/i }));

        await waitFor(() =>
            expect(toast.error).toHaveBeenCalledWith('errors.tooManyAttempts'),
        );
    });

    it('ApiError isNetworkError (status=0) → toast.error("errors.networkError")', async () => {
        vi.mocked(authApi.login).mockRejectedValue(
            new ApiError('Network error', 0, null),
        );
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
