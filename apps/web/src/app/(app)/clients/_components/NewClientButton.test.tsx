import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '@/lib/session';
import type { Membership, Role } from '@/types/domain';
import { NewClientButton } from './NewClientButton';

// ─────────────────────────────────────────────────────────────────────────────
// NewClientButton spec — CLIENT.CREATE role gate.
//
// The button mirrors permission.defaults.ts CLIENT.CREATE: only OWNER and
// ADMIN see it. Backend re-checks via ResourcePermissionGuard, but the gate
// here is what keeps non-privileged operators from clicking and bouncing.
//
// Strategy:
//   - vi.mock('@/lib/session') replaces useSession so each case fully
//     controls the role under test. The real provider's lifecycle is
//     covered by lib/session.test.tsx — re-mounting it here would just
//     test the wiring, not the gate logic.
//   - vi.mock('./ClientFormDialog') swaps the heavy dialog for a stub
//     that exposes `open` via a data-attribute. That keeps the assertion
//     local (no Radix Dialog portal interactions) and proves the lifted-
//     state pattern: clicking the button toggles open=true.
//
// Coverage focus: line 34 (`!role || !ROLES.some(r => r === role)`) and
// the lifted setOpen click handler.
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
    useSession: vi.fn(),
}));

vi.mock('./ClientFormDialog', () => ({
    ClientFormDialog: ({ open }: { open: boolean }) => (
        <div data-testid="client-form-dialog" data-open={String(open)} />
    ),
}));

function makeMembership(role: Role): Membership {
    return {
        id: 'm-1',
        role,
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        company: {
            id: 'c-1',
            legalName: 'Acme',
            tradeName: null,
            taxId: '00000000000000',
        },
    };
}

function setSessionWithRole(role: Role | null): void {
    vi.mocked(useSession).mockReturnValue({
        session: null,
        loading: false,
        memberships: [],
        activeMembership: role ? makeMembership(role) : null,
        membershipsLoading: false,
        signIn: vi.fn(),
        signOut: vi.fn(),
        setActiveCompany: vi.fn(),
    });
}

describe('NewClientButton — role gate', () => {
    beforeEach(() => {
        vi.mocked(useSession).mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('returns null when activeMembership is null (loading anti-flicker)', () => {
        setSessionWithRole(null);
        const { container } = render(<NewClientButton />);
        // Anti-flicker: nothing is rendered until the role is known. Without
        // this branch a non-OWNER would see the button for a frame as
        // memberships hydrate.
        expect(container).toBeEmptyDOMElement();
    });

    it('renders the button for OWNER', () => {
        setSessionWithRole('OWNER');
        render(<NewClientButton />);
        expect(screen.getByRole('button', { name: /newClient/i })).toBeInTheDocument();
    });

    it('renders the button for ADMIN', () => {
        setSessionWithRole('ADMIN');
        render(<NewClientButton />);
        expect(screen.getByRole('button', { name: /newClient/i })).toBeInTheDocument();
    });

    // Parameterized — every non-creator role bounces. If a future role is
    // added to permission.defaults.ts CLIENT.CREATE, this list must be
    // updated alongside CAN_CREATE_CLIENT_ROLES on line 26 of the source.
    it.each<Role>(['FINANCEIRO', 'OPERACIONAL', 'CLIENTE'])(
        'returns null for %s',
        (role) => {
            setSessionWithRole(role);
            const { container } = render(<NewClientButton />);
            expect(container).toBeEmptyDOMElement();
        },
    );

    it('clicking the button flips ClientFormDialog open=true', async () => {
        setSessionWithRole('OWNER');
        const user = userEvent.setup();
        render(<NewClientButton />);

        const dialog = screen.getByTestId('client-form-dialog');
        expect(dialog).toHaveAttribute('data-open', 'false');

        await user.click(screen.getByRole('button', { name: /newClient/i }));

        // setOpen(true) propagated to the dialog stub via lifted state.
        expect(dialog).toHaveAttribute('data-open', 'true');
    });
});
