# Arquitetura — visão geral

> Resumo. Para detalhes, veja os documentos linkados e os ADRs em `../adr/`.

## O que é o Orkestree

SaaS multi-tenant para empresas de serviço. O produto transforma cada solicitação de cliente em um fluxo operacional:

```
solicitação → service request → workflow/stage → tarefas → proposta → PDF → cobrança → automação
```

Não é um CRUD genérico. É um sistema operacional para empresas de serviço com isolamento estrito por tenant, exposição de dados consciente de role, transições auditáveis, e hooks de automação.

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | NestJS modular monolith |
| ORM | Prisma + PostgreSQL |
| Cache / fila | Redis + BullMQ |
| Frontend | Next.js 14 App Router |
| PDF | Puppeteer |
| Storage | Abstração com drivers local + S3/R2 |

Modular monolith por escolha consciente (ver [ADR-0001](../adr/0001-modular-monolith.md)). Microserviços ficam para quando módulos individuais precisarem escalar separadamente.

## Camadas e responsabilidades

```
apps/api          NestJS HTTP API — única autoridade pra autorização
apps/worker       BullMQ workers — consomem eventos do Outbox
apps/web          Next.js operator console
packages/*        código compartilhado entre apps
```

**Frontend nunca é fonte de verdade pra autorização.** Backend revalida tenant + role em cada request.

## Bounded contexts atuais

- **auth + workspace** — login, JWT, memberships, seleção de workspace
- **company-config** — workflows, permissões, service types, custom fields, audit ([ADR-0004](../adr/0004-company-config-first-class.md))
- **service-requests** — backbone operacional, ciclo de vida com transitions
- **clients** — PF/PJ via aggregate ([ADR-0005](../adr/0005-cliente-pf-pj-aggregate.md))
- **proposals** — DRAFT-only edição, totais server-side, PDF role-aware (ver [proposals.md](./proposals.md))
- **pdf** — geração e acesso autorizado
- **jobs** — expiry, geração assíncrona

Futuro: payments, chat, automations, dashboards.

## Princípios não-negociáveis

1. **Estado real do repo é a fonte de verdade.** Planos antigos não valem sem confirmar branch atual.
2. **`companyId` sempre vem de membership autenticada.** Nunca de payload.
3. **Prisma `select` explícito.** Nunca `include: true` em produção.
4. **Campos sensíveis protegidos no backend** (ver [field-level-auth.md](./field-level-auth.md)).
5. **Mutações de lifecycle são transaction-safe** com row-locking onde há race.
6. **Eventos só após commit.** Outbox + BullMQ ([ADR-0006](../adr/0006-event-driven-outbox-bullmq.md)).
7. **Audit dentro da própria transação** via `ConfigAuditService`.
8. **PRs estreitos** — uma responsabilidade por PR.

## Ler também

- [`multi-tenancy.md`](./multi-tenancy.md) — como `companyId` funciona
- [`field-level-auth.md`](./field-level-auth.md) — proteção de campos sensíveis
- [`proposals.md`](./proposals.md) — regras do módulo proposals
- [`../adr/`](../adr/) — decisões arquiteturais com contexto e trade-offs
- [`../runbooks/pr-checklist.md`](../runbooks/pr-checklist.md) — checklist antes de abrir PR
