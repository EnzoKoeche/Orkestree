You are working on Orkestree, a real-world multi-tenant B2B SaaS for service companies.

## Product mission
Orkestree transforms every client request into a complete operational workflow:
- a task in the Kanban board
- service documentation
- budget sheet
- commercial proposal
- chat thread
- financial updates

This is not a generic CRUD app. It is an operational orchestration platform.

## Core stack
- Frontend: Next.js
- Backend: NestJS
- Database: PostgreSQL
- ORM: Prisma
- Queues / async jobs: Redis + BullMQ
- Real-time: WebSocket
- File storage: S3 or Cloudflare R2
- Email: Resend or SendGrid
- PDF generation: Puppeteer

## Domain constraints
- The system is multi-tenant.
- Tenant isolation is mandatory.
- Domain data must be isolated by companyId whenever applicable.
- A user can belong to multiple companies.
- Company is both:
  - a legal/fiscal entity
  - an operational configuration boundary

## Company requirements
Each company must support:
- legal name
- trade name
- tax ID / CNPJ
- state registration
- municipal registration
- structured fiscal address
- financial email

## Client requirements
A client can be:
- an individual
- a business

Client data must support:
- CPF / CNPJ
- full name or legal name
- trade name when applicable
- email
- phone
- address
- additional metadata

## Operational configuration requirements
Each company can configure:
- service types
- custom intake fields
- workflow / Kanban stages
- stage assignee rules
- proposal templates
- PDF templates
- automation rules
- role permissions
- user permission overrides

Do not reduce these requirements to random JSON blobs when they need structured, queryable, auditable domain models.

## Roles
- OWNER
- ADMIN
- FINANCEIRO
- OPERACIONAL
- CLIENTE

## Visibility rules
- Internal cost and margin must only be visible to OWNER and ADMIN.
- FINANCEIRO can see final amounts, due dates, payments, receivables, and financial status, but not internal cost or margin.
- OPERACIONAL must not see financial internals.
- CLIENTE must only see approved/published external-facing data.

These rules must be enforced in backend authorization and response shaping, not just hidden in the UI.

## Engineering principles
- Prefer production-grade solutions over tutorial-style examples.
- Avoid amateur shortcuts.
- Avoid premature microservices.
- Prefer a modular monolith with strong internal boundaries.
- Use event-driven internal workflows where appropriate.
- Design for scalability, security, and auditability from day one.
- Always consider idempotency for async jobs.
- Always consider observability for critical flows.
- Always think about consistency across database, backend, and frontend.

## Backend implementation rules
- Keep controllers thin.
- Put business rules in services / domain-oriented application services.
- Use DTO validation.
- Use explicit authorization policies / guards.
- Avoid giant service classes.
- Do not expose tenant data without company scoping.
- Do not expose sensitive financial fields to unauthorized roles.
- Use Prisma with explicit relations, indexes, and enums.
- Do not use JSON as a lazy replacement for structured domain modeling when the data needs validation, searchability, versioning, or auditability.

## Async and workflow rules
- Split synchronous flows from asynchronous flows.
- Use BullMQ for background jobs.
- Use reliable event dispatching patterns.
- Prefer retryable and idempotent job design.
- Preserve traceability for generated proposals, documents, and notifications.

## Frontend implementation rules
- Use Next.js App Router.
- Keep clear separation between:
  - company portal
  - client portal
- Build for real operational UX, not just demo screens.
- Do not rely on frontend-only data hiding for security.

## Preferred behavior
When helping with this repository:
1. Understand the task first.
2. Read the existing code and structure before making changes.
3. Preserve architectural consistency.
4. Explain trade-offs when making important decisions.
5. Favor maintainability and correctness over fast but fragile patches.
6. When generating code, output complete and usable code whenever possible.

## Preferred response structure
- Goal
- Quick diagnosis
- Plan
- Implementation
- Risks / attention points
- Next steps
