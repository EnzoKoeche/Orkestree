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
| Sign-in (paste)   | `/sign-in`                              | none — see "Auth" below                       |
| Service Requests  | `/requests`, `/requests/:id`            | `GET /companies/:cid/requests[/:id]`          |
| Clients           | `/clients`, `/clients/:id`              | `GET /companies/:cid/clients[/:id]` + (de/re)activate |
| Proposals         | `/proposals`, `/proposals/:id`          | `GET /companies/:cid/proposals[/:id]` + send/approve/reject/cancel |
| Proposal PDF      | inline action on the proposal detail    | `GET /companies/:cid/proposals/:id/pdf`       |

Out of scope for this shell: public landing page, chat, payments, automation
builder, full client portal, mobile, visual polish.

## Auth (today)

There is no `/auth/login` endpoint in the backend yet — the `JwtAuthGuard`
exists but no `JwtStrategy` / `AuthController` is registered. Until that
ships, the operator pastes a JWT they obtained out-of-band plus the
`companyId` they want to enter as. The token is stored in `localStorage`
under `orkestree.session.v1` and sent as `Authorization: Bearer …` on every
request. **Server-side guards re-validate the token and the membership on
every call**, so a forged or stale token simply fails 401 / 403 — the UI's
gate is just a UX nicety.

When the auth module lands, only `src/app/sign-in/page.tsx` and
`src/lib/session.tsx` need to change. The rest of the app keeps working
unchanged.

## Layout

```
src/
  app/
    layout.tsx           — root <html>; mounts <Providers>
    providers.tsx        — SessionProvider + ToastProvider
    page.tsx             — redirector (→ /sign-in or /requests)
    sign-in/             — paste-a-JWT form
    (app)/               — route group: every authenticated screen
      layout.tsx         — wraps children in <AppShell>
      requests/          — list + detail
      clients/           — list + detail
      proposals/         — list + detail
  components/
    shell/               — AppShell, Sidebar, Header, PageContainer
    ui/                  — Button, Input, Card, Badge, Table, Modal, Toast, States
    feature/             — proposal-specific composites (status badge, actions, PDF button)
  lib/
    http.ts              — fetch wrapper, ApiError, session storage helpers
    api.ts               — typed wrappers for every backend endpoint we use
    session.tsx          — SessionProvider + useSession / useRequiredSession
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

## Backend API gaps surfaced while building this

These were intentionally **not** worked around with invented endpoints:

1. **No `POST /auth/login`.** No `AuthController` / `JwtStrategy` exists in
   `apps/api/src/auth/*`. Sign-in is therefore a paste-a-JWT form. Blocks any
   real user onboarding.
2. **No `GET /memberships/me` / "whoami".** The frontend cannot discover
   which workspaces a user belongs to, what role they hold, or their
   permission set. Today we ask the operator to type the `companyId` and
   pick a role hint manually. A whoami endpoint would let us:
   - drive a workspace switcher in the header
   - hide nav items the user definitely cannot reach
   - skip showing actions the backend will reject
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

1. **Auth integration.** Once `POST /auth/login` and `GET /memberships/me`
   ship, replace the paste-a-JWT page and add a workspace switcher.
2. **Reference data loaders.** Hooks for stages, service types, and
   memberships (cached per workspace) — unlocks rich list filters and the
   stage / assignee pickers on the request detail page.
3. **Proposal editing.** Items CRUD, totals re-compute UI, validity-date
   picker, notes editing — gated to DRAFT, mirroring backend invariants.
4. **Custom fields.** Render the workspace's `CustomField` schema on the
   request / client / proposal detail pages and wire the field-value
   endpoints.
5. **Tasks module** when it lands in the API.
6. **Pagination.** Replace the hard-coded `limit=100` with cursor / offset
   paginators on each list.
7. **SWR or React Query** once two pages need to invalidate the same cache.
