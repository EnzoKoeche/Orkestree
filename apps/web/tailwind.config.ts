import type { Config } from 'tailwindcss';

// Visual system: intentionally minimal. Two greys, one accent, four semantic
// colors for status. Anything beyond that goes through the components in
// src/components/ui to avoid divergence between pages.
const config: Config = {
    content: [
        './src/app/**/*.{ts,tsx}',
        './src/components/**/*.{ts,tsx}',
    ],
    theme: {
        extend: {
            colors: {
                // Surface palette
                surface: {
                    canvas: '#f7f7f8',
                    base: '#ffffff',
                    raised: '#ffffff',
                    sunken: '#f1f1f3',
                },
                border: {
                    DEFAULT: '#e5e7eb',
                    strong: '#d1d5db',
                },
                ink: {
                    DEFAULT: '#111827',
                    muted: '#4b5563',
                    subtle: '#6b7280',
                    faint: '#9ca3af',
                    inverse: '#ffffff',
                },
                accent: {
                    DEFAULT: '#1f2937',
                    soft: '#374151',
                    contrast: '#ffffff',
                },
                // Semantic states reused by Badge / status pills
                state: {
                    info: '#2563eb',
                    'info-bg': '#eff6ff',
                    success: '#15803d',
                    'success-bg': '#ecfdf5',
                    warning: '#b45309',
                    'warning-bg': '#fffbeb',
                    danger: '#b91c1c',
                    'danger-bg': '#fef2f2',
                    neutral: '#374151',
                    'neutral-bg': '#f3f4f6',
                },
            },
            fontFamily: {
                sans: [
                    'ui-sans-serif',
                    'system-ui',
                    '-apple-system',
                    'Segoe UI',
                    'Roboto',
                    'Helvetica',
                    'Arial',
                    'sans-serif',
                ],
                mono: [
                    'ui-monospace',
                    'SFMono-Regular',
                    'Menlo',
                    'Monaco',
                    'Consolas',
                    'monospace',
                ],
            },
            boxShadow: {
                card: '0 1px 2px 0 rgba(17, 24, 39, 0.04)',
                pop: '0 8px 24px -8px rgba(17, 24, 39, 0.18)',
            },
        },
    },
    plugins: [],
};

export default config;
