/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    // The frontend is server-side rendered for the operator app shell, but every
    // tenant-scoped data fetch happens in the browser using the user's JWT held
    // in localStorage. Server components therefore avoid touching the API at
    // request time on purpose — there is no shared session between the Next.js
    // server and the user's browser yet.
    poweredByHeader: false,
    // Expose only public env vars (NEXT_PUBLIC_*). API_URL is intentionally
    // public: it's the address of the backend the browser hits directly.
    env: {
        NEXT_PUBLIC_API_URL:
            process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000',
    },
};

module.exports = nextConfig;
