import createNextIntlPlugin from 'next-intl/plugin';

// Wires next-intl's getRequestConfig (./i18n.ts) into the build, exposing
// `getLocale()`, `getMessages()`, and `getTranslations()` to server
// components without per-route boilerplate.
const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
};

export default withNextIntl(nextConfig);
