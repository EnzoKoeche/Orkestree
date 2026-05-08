import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '@/lib/session';
import type { Membership, Role } from '@/types/domain';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

// ─────────────────────────────────────────────────────────────────────────────
// WorkspaceSwitcher spec — 4 render branches + dropdown selection.
//
// Strategy:
//   - vi.mock('@/lib/session') replaces useSession so each case fully
//     owns the membershipsLoading / memberships / activeMembership trio.
//   - For the multi-workspace branch we use userEvent + Radix DropdownMenu
//     happy path: click the trigger button, then click a menu item. Radix
//     portals its content to document.body; screen.findByRole('menuitem')
//     finds it without a custom container.
//
// Coverage focus: lines 49-84 (4 mutually-exclusive render branches) and
// line 108 (onSelect → setActiveCompany).
// ─────────────────────────────────────────────────────────────────────────────

vi.mock('@/lib/session', () => ({
    useSession: vi.fn(),
}));

function makeMembership(
    id: string,
    companyId: string,
    tradeName: string | null,
    legalName: string,
): Membership {
    return {
        id,
        role: 'OWNER' as Role,
        status: 'ACTIVE',
        createdAt: '2026-01-01T00:00:00Z',
        company: {
            id: companyId,
            legalName,
            tradeName,
            taxId: '00000000000000',
        },
    };
}

interface MockSessionShape {
    memberships: Membership[];
    activeMembership: Membership | null;
    membershipsLoading: boolean;
    setActiveCompany?: ReturnType<typeof vi.fn>;
}

function mockSession(shape: MockSessionShape): void {
    // Cast: `?? vi.fn()` infers a bare Mock type that doesn't match the
    // specific `(companyId: string) => void` signature on
    // SessionContextValue. tsc --noEmit catches the gap; vitest's own
    // transform doesn't, hence the CI-only failure on first run.
    vi.mocked(useSession).mockReturnValue({
        session: null,
        loading: false,
        memberships: shape.memberships,
        activeMembership: shape.activeMembership,
        membershipsLoading: shape.membershipsLoading,
        signIn: vi.fn(),
        signOut: vi.fn(),
        setActiveCompany: shape.setActiveCompany ?? vi.fn(),
    } as ReturnType<typeof useSession>);
}

describe('WorkspaceSwitcher — 4 render branches', () => {
    beforeEach(() => {
        vi.mocked(useSession).mockReset();
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('membershipsLoading=true: renders skeleton placeholder', () => {
        mockSession({
            memberships: [],
            activeMembership: null,
            membershipsLoading: true,
        });
        const { container } = render(<WorkspaceSwitcher />);

        // Skeleton: an aria-hidden div with animate-pulse, no static name
        // and no dropdown trigger. Avoids the "—" flicker between the
        // first paint and memberships hydration.
        const skeleton = container.querySelector('[aria-hidden="true"]');
        expect(skeleton).not.toBeNull();
        expect(skeleton?.className).toContain('animate-pulse');
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('memberships=[] (defensive): renders muted dash', () => {
        mockSession({
            memberships: [],
            activeMembership: null,
            membershipsLoading: false,
        });
        render(<WorkspaceSwitcher />);

        // Defensive branch: a logged-in user with zero ACTIVE memberships
        // shouldn't exist (the API filters by status), but if it does the
        // header shows "—" instead of crashing.
        expect(screen.getByText('—')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('memberships=[1]: renders static name without dropdown trigger', () => {
        const onlyOne = makeMembership('m-1', 'c-1', 'Acme Trade', 'Acme Legal LTDA');
        mockSession({
            memberships: [onlyOne],
            activeMembership: onlyOne,
            membershipsLoading: false,
        });
        render(<WorkspaceSwitcher />);

        // Single workspace: the affordance to switch is intentionally absent
        // — no button/chevron/dropdown when there's nothing to switch to.
        expect(screen.getByText('Acme Trade')).toBeInTheDocument();
        expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });

    it('memberships=[2+]: renders button + chevron + dropdown trigger', async () => {
        const memA = makeMembership('m-a', 'c-a', 'Acme', 'Acme LTDA');
        const memB = makeMembership('m-b', 'c-b', null, 'Beta LTDA');
        mockSession({
            memberships: [memA, memB],
            activeMembership: memA,
            membershipsLoading: false,
        });
        const user = userEvent.setup();
        render(<WorkspaceSwitcher />);

        // Trigger reflects the active workspace by name.
        const trigger = screen.getByRole('button', { name: /Acme/ });
        expect(trigger).toBeInTheDocument();

        await user.click(trigger);

        // Both workspaces appear in the menu. tradeName ?? legalName: memA
        // surfaces as "Acme" (tradeName), memB falls back to "Beta LTDA".
        expect(
            await screen.findByRole('menuitem', { name: /Acme/ }),
        ).toBeInTheDocument();
        expect(
            screen.getByRole('menuitem', { name: /Beta LTDA/ }),
        ).toBeInTheDocument();
    });

    it('clicking a menu item calls setActiveCompany with company.id', async () => {
        const memA = makeMembership('m-a', 'c-a', 'Acme', 'Acme LTDA');
        const memB = makeMembership('m-b', 'c-b', 'Beta', 'Beta LTDA');
        const setActiveCompany = vi.fn();
        mockSession({
            memberships: [memA, memB],
            activeMembership: memA,
            membershipsLoading: false,
            setActiveCompany,
        });
        const user = userEvent.setup();
        render(<WorkspaceSwitcher />);

        await user.click(screen.getByRole('button', { name: /Acme/ }));
        await user.click(
            await screen.findByRole('menuitem', { name: /Beta/ }),
        );

        expect(setActiveCompany).toHaveBeenCalledWith('c-b');
    });
});
