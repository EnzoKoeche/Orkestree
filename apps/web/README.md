# @orkestree/web

Internal-operator console for Orkestree. A thin Next.js (App Router) UI that
talks to the NestJS API in `apps/api` over HTTP. **No backend logic lives
here** — every page composes existing endpoints and respects the contracts
they enforce server-side.

## Stack

- Next.js 14 (App Router, React 18, server + client components)
- TypeScript (strict)
- Tailwind CSS 3 — see `tailwind.config.ts` for the (intentionally small)
  design tokens
- No state library yet. A tiny `useResource` hook in `src/lib/use-resource.ts`
  covers list + detail fetches; we'll graduate to SWR / React Query the day a
  page actually needs cross-component cache invalidation.

## What this app does today

| Surface           | Routes                                  | Backend it speaks to                          |
| ----------------- | --------------------------------------- | --------------------------------------------- |
| Sign-in           | `/sign-in`                              | `POST /auth/login`                            |
| Bootstrap         | (every authenticated route)             | `GET /memberships/me`                         |
| Service Requests  | `/requests`, `/requests/:id`            | `GET /companies/:cid/requests[/:id]`          |
| Clients           | `/clients`, `/clients/:id`              | `GET /companies/:cid/clients[/:id]` + (de/re)activate |
| Proposals         | `/proposals`, `/proposals/:id`          | `GET /companies/:cid/proposals[/:id]` + send/approve/reject/cancel |
| Proposal PDF      | inline action on the proposal detail    | `GET /companies/:cid/proposals/:id/pdf`       |

Out of scope for this shell: public landing page, chat, payments, automation
builder, full client portal, mobile, visual polish.

## Auth

Sign-in is a real email + password form wired to `POST /auth/login`. On
success the backend returns a signed JWT; the frontend stores it in
`localStorage` (`orkestree.session.v1`) and sends it as `Authorization:
Bearer …` on every API call. Server-side guards (`JwtAuthGuard`,
`CompanyMemberGuard`, `ResourcePermissionGuard`) re-validate the token,
the user's `isActive`, and the membership's `status === ACTIVE` on every
request, so the client-side gate is a UX gate, not an authorization one.

Right after sign-in (and on every full page reload) the app calls
`GET /memberships/me` to load:

- the current user identity
- the list of ACTIVE memberships in ACTIVE companies
- the role per membership

The session provider picks one membership as active (the last one used,
falling back to the first the backend returned). When the user has more
than one membership, a workspace switcher is rendered in the header. The
backend keeps a single canonical token per session — switching workspaces
does NOT issue a new JWT; it only changes which `companyId` the frontend
sends in the URL of subsequent calls. `CompanyMemberGuard` re-checks
membership on every call, so a switch the backend disagrees with simply
403s.

### Why localStorage and not httpOnly cookies?

This is a deliberate, scoped trade-off:

- The API is configured for `Authorization: Bearer …` with
  `credentials: 'omit'` everywhere; switching to cookies needs CORS
  `allowCredentials` + a CSRF surface that is intentionally out of scope
  for this phase.
- The operator console runs on a different origin from the API in dev,
  which makes cookie scoping awkward without a same-site reverse proxy.
- The product is internal-operator today, not end-customer; localStorage
  is acceptable here in a way it would not be for a public client portal.

Plan: migrate to httpOnly cookies the same week the auth module ships
SSO/refresh tokens.

## Layout

```
src/
  app/
    layout.tsx           — root <html>; mounts <Providers>
    providers.tsx        — SessionProvider + ToastProvider
    page.tsx             — redirector (→ /sign-in, /requests, or /proposals
                           depending on the active membership's role)
    sign-in/             — email + password form → POST /auth/login
    (app)/               — route group: every authenticated screen
      layout.tsx         — wraps children in <AppShell>
      requests/          — list + detail
      clients/           — list + detail
      proposals/         — list + detail
  components/
    shell/               — AppShell (auth gate, four-phase),
                           Sidebar (role-aware nav),
                           Header (workspace switcher + identity),
                           PageContainer
    ui/                  — Button, Input, Card, Badge, Table, Modal, Toast, States
    feature/             — proposal-specific composites (status badge, actions, PDF button)
  lib/
    http.ts              — fetch wrapper, ApiError, session storage helpers
    api.ts               — typed wrappers for every backend endpoint we use
                           (authApi.login, membershipsApi.me, plus domain APIs)
    session.tsx          — SessionProvider + useSession / useRequiredSession,
                           four phases: loading | unauthenticated |
                           no-workspaces | authenticated
    use-resource.ts      — minimal data-fetching hook
    format.ts            — currency / date / name helpers
  types/
    domain.ts            — hand-written response shapes that match the
                           backend's explicit Prisma `select` projections
```

## Running

```bash
# from repo root
pnpm install                          # or npm install / yarn install
cp apps/web/.env.example apps/web/.env.local
pnpm --filter @orkestree/web dev      # → http://localhost:3001

# the API must be reachable at NEXT_PUBLIC_API_URL (defaults to localhost:3000)
pnpm --filter @orkestree/api start:dev
```

Useful scripts:

```bash
pnpm --filter @orkestree/web typecheck
pnpm --filter @orkestree/web lint
pnpm --filter @orkestree/web build
```

## Backend API gaps still open

Auth is now wired end-to-end, but a few related gaps remain. They are
intentionally **not** worked around with invented endpoints:

1. **No password-set / invite-acceptance flow.** `POST /auth/login`
   verifies a stored hash, but there is no endpoint to set the initial
   password for a newly invited user. Today, accounts must be seeded
   directly in the database (the `AuthService.hashPassword(plain)` helper
   produces hashes in the format the verifier expects).
2. **No refresh-token endpoint.** The access token's lifetime is
   `JWT_EXPIRES_IN` (default 7 days). When it expires, the user is silently
   bounced to `/sign-in`. A refresh flow is part of the next auth phase.
3. **No catalogue endpoints surfaced for service-request stages or service
   types** in the operator UI. The backend supports the corresponding
   filters (`stageId`, `serviceTypeId`, `assignedMembershipId`) but we
   cannot populate dropdowns without a list endpoint that the UI is
   permitted to call. The list page therefore exposes only the
   `isCancelled` filter for now.
4. **No proposal items / field-values mutation endpoints surfaced in the
   UI.** They exist server-side but require workspace-specific custom-field
   schemas the operator UI does not yet load. Items are shown read-only.

## Recommended next frontend steps

1. **Reference data loaders.** Hooks for stages, service types, and
   memberships (cached per workspace) — unlocks rich list filters and the
   stage / assignee pickers on the request detail page.
2. **Proposal editing.** Items CRUD, totals re-compute UI, validity-date
   picker, notes editing — gated to DRAFT, mirroring backend invariants.
3. **Custom fields.** Render the workspace's `CustomField` schema on the
   request / client / proposal detail pages and wire the field-value
   endpoints.
4. **Tasks module** when it lands in the API.
5. **Pagination.** Replace the hard-coded `limit=100` with cursor / offset
   paginators on each list.
6. **SWR or React Query** once two pages need to invalidate the same cache.
7. **Refresh-token / cookie migration.** Once the auth module ships
   refresh tokens, move from localStorage to httpOnly cookies and add the
   CSRF surface that comes with `credentials: 'include'`.
