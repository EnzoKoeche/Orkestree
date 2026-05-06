import { getRequestConfig } from 'next-intl/server';

// Single-locale setup for now: every request resolves to PT-BR with the same
// dictionary. The structure is already next-intl-shaped so adding EN later is
// (a) write `messages/en.json`, (b) read locale from cookie / accept-header,
// (c) gate `messages: …` on the resolved locale. No component changes needed.
//
// `pt-BR` (vs plain `pt`) is intentional: it surfaces in the `<html lang>`
// attribute and steers screen readers, browser auto-translate, and Intl.*
// formatters toward Brazilian Portuguese conventions.
export default getRequestConfig(async () => ({
    locale: 'pt-BR',
    messages: (await import('./messages/pt.json')).default,
}));
