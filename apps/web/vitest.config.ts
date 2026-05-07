import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// ─────────────────────────────────────────────────────────────────────────────
// Vitest config — apps/web
//
// jsdom is the right env for RTL renders (browser globals: window,
// document, localStorage). globals: true exposes describe/it/expect
// without per-file imports — matches the Jest convention from apps/api.
//
// css: false skips CSS module loading for tests; component visual styling
// isn't asserted (RTL queries by accessible name/role, not by class).
//
// Path alias '@' mirrors apps/web/tsconfig.json so specs can import from
// `@/lib/foo` like the source code does.
// ─────────────────────────────────────────────────────────────────────────────

export default defineConfig({
    plugins: [react()],
    test: {
        environment: 'jsdom',
        setupFiles: ['./vitest.setup.ts'],
        globals: true,
        css: false,
    },
    resolve: {
        alias: { '@': path.resolve(__dirname, 'src') },
    },
});
