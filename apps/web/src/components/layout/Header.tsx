import { UserMenu } from './UserMenu';
import { WorkspaceSwitcher } from './WorkspaceSwitcher';

// ─────────────────────────────────────────────────────────────────────────────
// Header — sticky top chrome.
//
// Same surface as <main> (bg-background) with a 1 px bottom border. The
// header fades into the page until the operator reaches for it. 56 px tall
// — meio-termo between Linear's compact 48 px and Notion's roomy 64 px.
//
// Composition only: WorkspaceSwitcher owns the left zone (caption +
// company picker, with shape that varies by membership count), UserMenu
// owns the right zone (avatar + name dropdown with Sair). Both are
// `'use client'` for their hooks and dropdowns; this file stays a server
// component so the chrome itself adds no hydration cost beyond what the
// two children already pay.
// ─────────────────────────────────────────────────────────────────────────────

export function Header() {
    return (
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-background px-6">
            <WorkspaceSwitcher />
            <UserMenu />
        </header>
    );
}
