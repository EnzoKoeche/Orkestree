# Orkestree — Master Project Context for Claude Code

## 0. Sistema de Conhecimento

Este projeto usa dois sistemas de conhecimento, configurados na pasta `docs/` e no Notion. Não é decorativo — leia antes de começar qualquer coisa.

**Antes de começar qualquer tarefa:**

1. Ler `docs/README.md` para entender a divisão Obsidian/Notion.
2. Buscar no Notion (página "🧠 Orkestree — Cérebro do Projeto"):
   - Tarefas em "✅ Tarefas" com Status `TODO` ou `Em Progresso`
   - Bugs em "🐛 Bugs Conhecidos" com Severidade `Alta` ou `Crítica` em status `Aberto`/`Investigando`
   - Decisões recentes em "🏛️ Decisões Técnicas" com Status `Aceita`
3. Inspecionar branch atual e estado real do repo (`git status`, `git log`, filesystem).

**Ao final da sessão:**

1. Registrar resumo + próximos passos em "💬 Sessões Claude Code" (Notion).
2. Atualizar tarefas concluídas/criadas em "✅ Tarefas".
3. Registrar bugs encontrados em "🐛 Bugs Conhecidos".
4. Se uma decisão arquitetural foi tomada **e estabilizada**, criar ADR em `docs/adr/` **E** entrada correspondente em "🏛️ Decisões Técnicas".

**Divisão de responsabilidade:**

- `docs/` (este repo) = documentação técnica versionada que vive com o código (arquitetura, ADRs, runbooks).
- Notion = gestão operacional (tarefas, bugs, sessões, decisões em formação).
- Decisões nascem no Notion (rápido, baixa fricção) e migram para `docs/adr/` quando estabilizam — citando a página Notion como fonte.

---

## 1. Product vision

Orkestree is a multi-tenant SaaS for service companies.

Its core purpose is to transform each client request into a full operational flow instead of letting work be scattered across WhatsApp, email, spreadsheets, and disconnected systems.

The intended operational chain is:

client request -> service request record -> workflow/stage progression -> internal tasks -> proposal -> PDF/document -> financial follow-up -> automation/chat

This is not a generic CRUD dashboard product.
It is an operational system for service businesses with strict tenant isolation, role-aware data exposure, auditable state transitions, and future automation hooks.

---

## 2. Core architecture

### Backend
- NestJS modular monolith
- PostgreSQL
- Prisma ORM
- Redis
- BullMQ for async jobs
- Event-driven internal architecture
- Row-locking and transactional lifecycle handling where needed

### Frontend
- Next.js 14 App Router
- Internal operator console first
- Role-aware UI, but frontend is never the source of truth for authorization

### Storage / documents
- PDF generation via Puppeteer
- Storage abstraction for local and S3/R2-style drivers
- Proposal PDF pipeline already introduced in the project flow

### Guiding architectural decision
This project intentionally uses a modular monolith instead of early microservices.
The current priority is correctness, consistency, and velocity — not distributed complexity.

---

## 3. Non-negotiable engineering rules

1. Always treat the **current repository state** as the source of truth.
   - Never assume a module exists just because it was planned in prior conversations.
   - Verify in the filesystem and code first.

2. `companyId` must always come from authenticated membership / trusted context.
   - Never trust arbitrary client payload for tenant scoping.

3. Prefer explicit relational/domain entities over JSON blobs.
   - If something is core to the business, model it clearly.

4. Prefer explicit Prisma `select` projections.
   - Avoid broad `include: true` on production entities.

5. Sensitive fields must be protected in backend response shaping.
   - Never rely on frontend hiding alone.
   - The sensitive-field registry and projection design matter.

6. Critical lifecycle mutations must be transaction-safe.
   - Use transactions.
   - Use row locking where state transitions or race-prone updates exist.
   - Emit domain events only after commit.

7. Do not redesign already approved/stable modules without a concrete bug or integration need.

8. Do not invent backend APIs silently when working on the frontend.
   - If an endpoint is missing, surface the gap clearly.

9. Prefer narrow, reviewable PRs.
   - One clear responsibility per PR.

10. Optimize for production-safe correctness, not tutorial-style speed.

---

## 4. Domain model principles

### Multi-tenancy
The platform is multi-tenant by `companyId`.
Tenant isolation is enforced both:
- in application logic
- and in database integrity (including composite constraints / tenant-safe relationships where applicable)

### Users and memberships
Users are global identities.
Operational access is scoped through company memberships.
A user may belong to multiple companies/workspaces.

### Roles
Current role model includes:
- OWNER
- ADMIN
- FINANCEIRO
- OPERACIONAL
- CLIENTE

### Visibility rules
- OWNER / ADMIN: full internal visibility, including internal cost and margin-sensitive data
- FINANCEIRO: financial visibility, but not automatically all internal-cost details
- OPERACIONAL: operational visibility, not sensitive internal finance by default
- CLIENTE: only externally visible data, row-filtered

---

## 5. Current product shape

The product is being built from the backend foundation upward, then connected into a real operator-facing web app.

Current backend/business areas in the broader project plan:
- auth and workspace bootstrap
- company-config
- service-requests
- clients
- proposals
- PDF generation/access
- jobs/expiry
- later: payments, chat, automations, richer dashboards

Current frontend focus:
- internal operator console
- request -> proposal flow
- proposal editing and PDF access
- progressive enrichment of operator workflows

---

## 6. Important module history and status

IMPORTANT:
Use the repo state to confirm all of this.
Do not assume every listed item is already merged into the current branch.

### Company-config
Strong operational configuration module.
Includes patterns for:
- workflows
- permissions
- service types
- custom fields
- audit support

These modules establish the project style for:
- DTOs
- guards
- service layering
- transaction boundaries
- explicit projections

### Service Requests
Core operational bounded context.
This is the backbone of the system.
Service requests represent the main operational entrypoint and connect to:
- workflow
- stages
- client
- downstream proposal creation

### Clients
Client foundation exists in the project history and architecture as:
- INDIVIDUAL / BUSINESS support
- tenant-safe client records
- linkage to requests
- typed fields / operational profile data

### Proposals
Proposals are a major focus of the current phase.

The proposal domain includes:
- Proposal
- Proposal items
- proposal lifecycle/status
- proposal PDF generation
- proposal PDF access
- proposal creation from service requests
- proposal editing in DRAFT state only
- server-side authoritative total recomputation
- client-facing PDF generation with no internal cost leakage

### Tasks
Tasks were discussed heavily in planning/history, but must always be validated in the repo state before assuming they exist.

---

## 7. Frontend progress and philosophy

A Next.js internal operator app has already been introduced in the project flow.

The intended UI direction is:
- operator-first
- not a marketing site
- not overdesigned
- practical, state-aware, workflow-oriented

Core current/focused pages:
- sign-in
- requests list/detail
- clients list/detail
- proposals list/detail

Key frontend principles:
- thin integration over existing backend contracts
- backend remains source of truth
- role/status-aware UX
- clear empty/loading/error states
- avoid fake/mock APIs once backend exists

Proposal editing UI must:
- only allow edits in DRAFT
- use backend responses as source of truth for totals
- never locally become authoritative on pricing
- preserve PDF actions and lifecycle actions

---

## 8. Auth and workspace bootstrap direction

The system moved from temporary token-paste flow toward real auth bootstrap.

The intended auth/workspace shape is:
- real login endpoint
- JWT-based authenticated flow
- memberships bootstrap endpoint
- active workspace selection in the frontend
- frontend stores current active workspace context
- backend still re-validates tenant membership per request

Important:
The frontend is not the source of truth for authorization.
Workspace context on the frontend is a convenience layer; the backend remains the authority.

---

## 9. Proposal-specific rules

These are critical and must not be broken:

1. Proposal is linked to a Service Request.
2. Proposal may also carry client linkage.
3. Proposal lifecycle includes DRAFT and post-draft states like SENT / APPROVED / REJECTED / EXPIRED / CANCELLED depending on current repo implementation.
4. Only DRAFT proposals are editable.
5. Item mutations and proposal-level mutations must respect DRAFT-only constraints.
6. Totals are backend-computed.
7. PDF generation must use persisted proposal state, not frontend payload assumptions.
8. Client-facing PDFs must never expose internal cost / totalCost / internal notes.
9. Proposal access for CLIENTE must be row-filtered consistently with request ownership rules currently implemented in the backend.
10. PDF access must be authorization-safe and tenant-safe.

---

## 10. Async / jobs principles

BullMQ is being used for background processing.

Current/projected uses include:
- proposal expiry
- proposal PDF generation
- later: email sending, additional async workflows

Rules:
- job processors should delegate to domain services instead of duplicating business logic
- keep idempotency explicit
- preserve post-commit event semantics
- scale safely across replicas
- use conservative concurrency unless a domain service is explicitly built for more

---

## 11. What has already been built in the recent project flow

This section is a conversational handoff and must still be validated against the actual branch state.

The broader recent implementation flow has included:
- internal operator web app shell
- real auth bootstrap with JWT + memberships
- proposal draft editing in frontend
- create proposal from request flow in frontend
- proposal expiry job
- proposal PDF pipeline
- proposal PDF access surface

Again:
Treat this as context, not blind truth.
Inspect the repo before acting.

---

## 12. How Claude Code should behave in this repository

When starting any task:

1. Read this file first.
2. Inspect the actual repo state.
3. Confirm what is merged/present on the current branch.
4. Summarize:
   - what exists
   - what is missing
   - what the best next step is
5. Only then change code.

When implementing:
- prefer narrow diffs
- preserve existing module style
- be explicit about any discovered API gaps
- do not silently widen scope

When working on frontend:
- only consume endpoints that truly exist
- if a missing backend contract blocks a UX step, surface it clearly

When working on backend:
- preserve tenant isolation
- use the same style already established in service-requests / company-config / auth / proposals
- avoid architectural drift

---

## 13. Current likely next-step areas

These are likely next priorities, but must be validated against the current branch and open PR state:

1. Reference-data loaders for richer operator flows
2. Membership directory endpoint for assignee filters/pickers
3. Richer service request detail actions
4. Proposal-related operator workflows end-to-end
5. Email delivery of proposal/PDF
6. Payments / financial follow-up
7. Broader automation UI later

The rule is:
Prefer the smallest next step that unlocks the biggest operator value.

---

## 14. Immediate instruction to Claude Code

Before making any changes in a new session, do this:

- Read CLAUDE.md
- Inspect the current branch and filesystem
- Tell me:
  1. what is already implemented,
  2. what is pending,
  3. what the safest high-ROI next step is,
  4. what should not be touched

Do not assume previous plans are merged unless you confirm them in the repository.

---

## 15. Project memory wiki (Obsidian)

There is a persistent project-memory wiki at:

```
C:\Users\enzo\Documents\Obsidian Vault\orkestree
```

It is an Obsidian vault maintained by Claude. Its purpose: accumulate non-obvious knowledge about Orkestree (bugs and their root causes, architectural decisions and why, module deep-dives, gotchas, divergences between this CLAUDE.md and the actual repo state) so future sessions debug faster instead of re-investigating from scratch.

**Workflow for every session:**

1. **Before investigating anything**, read at minimum:
   - `<vault>\index.md` — catalog
   - `<vault>\gotchas.md` — known traps
   - `<vault>\modulos\<module-being-touched>.md` — module-specific knowledge
   - For bug-shaped tasks: grep `<vault>\bugs\` for symptom keywords.
2. **Do the work in this repo as usual** (read/inspect/implement here).
3. **After learning something worth remembering**, update the vault:
   - Bug resolved → `bugs/<slug>.md` + append entry to `log.md`.
   - Architectural decision → `decisoes/<slug>.md` + `log.md`.
   - Non-obvious module insight → update `modulos/<name>.md`; if it's a trap, also `gotchas.md`.
   - Drift between this CLAUDE.md and reality → record in `gotchas.md` or relevant module.

**Hard rule:** the vault is the **only** place Claude writes outside this repo. The vault never modifies this repo, except this section. Templates and the maintenance protocol live in `<vault>\CLAUDE.md`.
