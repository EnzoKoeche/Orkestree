import createNextIntlPlugin from 'next-intl/plugin';

// Wires next-intl's getRequestConfig (./i18n.ts) into the build, exposing
// `getLocale()`, `getMessages()`, and `getTranslations()` to server
// components without per-route boilerplate.
const withNextIntl = createNextIntlPlugin('./i18n.ts');

// Security headers — Sessão 14 / TASK-AUDIT-4.
//
// Aplicados em todas as rotas. Cobertura:
//   - X-Frame-Options: DENY — bloqueia o site de ser carregado em iframe
//     (clickjacking). Orkestree não é embed-friendly por design.
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
// CSP (Content-Security-Policy) NÃO está aqui — fica em TASK-AUDIT-7
// porque exige nonces por request (middleware-based) e mais teste de
// regressão.
const securityHeaders = [
    { key: 'X-Frame-Options', value: 'DENY' },
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
