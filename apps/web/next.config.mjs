import createNextIntlPlugin from 'next-intl/plugin';

// Wires next-intl's getRequestConfig (./i18n.ts) into the build, exposing
// `getLocale()`, `getMessages()`, and `getTranslations()` to server
// components without per-route boilerplate.
const withNextIntl = createNextIntlPlugin('./i18n.ts');

// Security headers — Sessão 14 / TASK-AUDIT-4 + AUDIT-7.
//
// Aplicados em todas as rotas. Cobertura:
//   - X-Content-Type-Options: nosniff — impede o browser de adivinhar o
//     Content-Type de um asset (mitigação de MIME-sniffing).
//   - Referrer-Policy: strict-origin-when-cross-origin — same-origin envia
//     URL completa, cross-origin envia só o origin sob HTTPS, downgrades
//     HTTPS→HTTP não enviam nada. Padrão moderno equilibrado.
//   - Permissions-Policy: nega APIs sensíveis que não usamos. Lista
//     conservadora — adicionar entradas conforme features (ex.: camera()
//     se um dia tivermos upload via webcam).
//   - Strict-Transport-Security: força HTTPS por 2 anos. Sem `preload`
//     porque o subdomínio vercel.app já está no preload list da Vercel
//     (não controlamos o apex). Ativo só em produção — em dev, HSTS num
//     localhost mistura com sites reais e é difícil de remover.
//
// `X-Frame-Options: DENY` foi removido em AUDIT-7 — `frame-ancestors 'none'`
// no CSP (apps/web/middleware.ts) é o equivalente moderno e cobre todos os
// browsers que importam. ⚠️ Durante a janela Report-Only (Fase 1, 24-48h
// pós-merge), a CSP não enforça, então existe gap teórico de clickjacking.
// Aceito porque (a) o app não tem fluxos sensíveis a clickjacking sem
// re-auth, (b) janela é curta, (c) Phase 2 (1-line PR) flipa pra enforcing.
//
// CSP (Content-Security-Policy-Report-Only por enquanto) é emitido pelo
// middleware Edge porque exige nonce per-request e propagação ao SSR tree.
const securityHeaders = [
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    {
        key: 'Permissions-Policy',
        value: 'camera=(), microphone=(), geolocation=(), interest-cohort=(), payment=(), usb=()',
    },
];

if (process.env.NODE_ENV === 'production') {
    securityHeaders.push({
        key: 'Strict-Transport-Security',
        value: 'max-age=63072000; includeSubDomains',
    });
}

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    async headers() {
        return [
            {
                source: '/:path*',
                headers: securityHeaders,
            },
        ];
    },
};

export default withNextIntl(nextConfig);
