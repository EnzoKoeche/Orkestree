import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, vi } from 'vitest';

// ─────────────────────────────────────────────────────────────────────────────
// Vitest test setup — runs once before each spec file.
//
// 1. jest-dom matchers (toBeInTheDocument, toHaveAttribute, etc.) extended
//    onto vitest's expect. Spec files don't need to import this themselves.
//
// 2. RTL cleanup after every test. RTL's auto-cleanup is enabled by default
//    in newer versions, but explicit afterEach is robust against silent
//    behaviour changes when @testing-library/react updates major.
//
// 3. Default mocks for next-intl and next/navigation. Tests can override
//    per-spec via vi.mocked() or by re-mocking inline. Trade-off: identity
//    function for translations doesn't catch missing keys, but it covers
//    the component logic the specs care about. If a spec needs to assert
//    on actual translated copy, override the mock for that file.
// ─────────────────────────────────────────────────────────────────────────────

afterEach(() => {
    cleanup();
});

vi.mock('next-intl', () => ({
    useTranslations: () => (key: string, values?: Record<string, unknown>) =>
        values ? `${key}:${JSON.stringify(values)}` : key,
}));

// useRouter MUST return a stable reference across calls. Returning a fresh
// object literal each invocation makes hooks that depend on router (e.g.
// SessionProvider's useEffect([session, router])) re-fire on every render
// → setState → re-render → infinite loop → OOM. Specs assert on
// router.push by re-importing useRouter and reading its return value;
// they reset call history via vi.clearAllMocks() in their own afterEach.
const mockRouter = {
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
};

vi.mock('next/navigation', () => ({
    useRouter: () => mockRouter,
    usePathname: () => '/',
    useSearchParams: () => new URLSearchParams(),
}));
