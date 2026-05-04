# Module — Proposals

> Estado atual da branch — verifique sempre antes de assumir que algo está merged.

## Modelo

```
Proposal
├── companyId, serviceRequestId, clientId?
├── number (sequencial por company)
├── status: DRAFT | SENT | APPROVED | REJECTED | EXPIRED | CANCELLED
├── title, notes (interno), clientNotes (externo)
├── discountPct? OU discountAmount? (mutuamente exclusivos)
├── subtotal, totalPrice, totalCost  ← computados pelo backend
├── validUntil?, pdfUrl?, pdfGeneratedAt?
├── sentAt?, approvedAt?, rejectedAt?, expiredAt?, cancelledAt?
├── approvedByMembershipId?, rejectedByMembershipId?, createdByMembershipId
└── items: ProposalItem[]
```

`ProposalItem` tem `description`, `unit?`, `quantity`, `unitPrice`, `discountPct?`, `internalCost?` (sensível), `subtotal` (computado), `sortOrder`.

`ProposalStatusHistory` é append-only e mirrors `RequestStageHistory`. `fromStatus = null` na criação inicial.

## Lifecycle

```
DRAFT ──► SENT ──► APPROVED
       │       ├── REJECTED
       │       └── CANCELLED
       └── CANCELLED

SENT ──► EXPIRED  (apenas via job, nunca via API)
```

- `DRAFT` é o único status editável (proposal e items).
- `EXPIRED` é setado **apenas** pelo job de expiry. API rejeita com 422 se solicitado.
- `APPROVED` exige permissão `PROPOSAL.APPROVE`.
- `REJECTED` exige permissão `PROPOSAL.REJECT`.
- `SENT` exige ≥ 1 item.
- Partial unique index `udx_one_approved_proposal_per_request` garante: no máximo uma proposal `APPROVED` por `serviceRequestId`. P2002 → mapear para 409 Conflict.

## Mutações DRAFT-only

Todo mutator (proposal e items) faz:

1. `prisma.$transaction(async tx => …)`
2. `SELECT … FOR UPDATE` na proposal
3. Verifica `status === DRAFT`
4. Aplica mutação
5. Recomputa totais (se mudou item ou discount)
6. Audit dentro da tx
7. Evento via `EventEmitter2` **após** o commit

## Totais

Sempre recomputados server-side em `ProposalItemsService.recomputeProposalTotals`:

```
item.subtotal  = quantity × unitPrice × (1 − discountPct/100)
proposal.subtotal     = Σ items.subtotal
proposal.totalCost    = Σ (item.internalCost × item.quantity)
effectiveDiscount     = discountAmount ?? (subtotal × discountPct/100) ?? 0
proposal.totalPrice   = max(0, subtotal − effectiveDiscount)
```

Decimal `ROUND_HALF_EVEN`, 2 casas. `discountPct` e `discountAmount` são **mutuamente exclusivos**: setar um zera o outro.

Frontend **nunca** é autoridade de totais. Usa o que o backend retornou.

## Visibilidade role-aware

Três selects no service (list e detail), espelhando as três fronteiras de confiança — ver [`field-level-auth.md`](./field-level-auth.md):

- `PROPOSAL_*_PRIVILEGED` — OWNER/ADMIN: inclui `totalCost` e `item.internalCost`.
- `PROPOSAL_*_STANDARD` — FINANCEIRO/OPERACIONAL: notas internas, audit history, `approvedBy/rejectedBy`, **sem** `totalCost` nem `item.internalCost`.
- `PROPOSAL_*_CLIENT` — CLIENTE: subset estrito externo (sem notas internas, sem audit history, sem custo interno, sem motivo de rejeição).

`FieldFilterInterceptor` global (Mecanismo B) é defense-in-depth via `SENSITIVE_FIELD_REGISTRY`.

## CLIENTE

- Filtrar por `serviceRequest.createdByMembershipId = membership.id`.
- Proposals em `DRAFT` invisíveis. Lista retorna `[]` se status filtrado for DRAFT; get nega com 404.

## PDF

- Gerado via Puppeteer, idealmente em job assíncrono.
- PDF para CLIENTE usa **exclusivamente** o select CLIENT — nunca expõe `totalCost`, `internalCost`, `notes` interno.
- Acesso ao PDF é authorization-safe e tenant-safe.

## Endpoints

```
GET    /companies/:companyId/proposals
POST   /companies/:companyId/proposals
GET    /companies/:companyId/proposals/:proposalId
PATCH  /companies/:companyId/proposals/:proposalId
POST   /companies/:companyId/proposals/:proposalId/transition

GET    /companies/:companyId/proposals/:proposalId/items
POST   /companies/:companyId/proposals/:proposalId/items
PATCH  /companies/:companyId/proposals/:proposalId/items/:itemId
DELETE /companies/:companyId/proposals/:proposalId/items/:itemId
```

`POST /transition` é o **entrypoint único** para send/approve/reject/cancel. Body inclui `toStatus` + `note?` + `rejectionReason?` + `cancellationReason?`.

## Eventos emitidos

- `proposal.created`
- `proposal.transitioned` (payload: `{ proposalId, fromStatus, toStatus }`)

Sempre após commit. Outbox pattern aplicável quando o evento precisar atravessar processo (ver [ADR-0006](../adr/0006-event-driven-outbox-bullmq.md)).

## Gotchas

- Esquecer `companyId` em raw SQL = vazamento sem alarme (não há trigger no banco).
- Update de proposal com discount mas sem itens devolve totais zerados — comportamento intencional, não regressão.
- `Decimal` serializa como string em JSON. Não compare com `number` direto no frontend.
- Transitions devem considerar o pior caso: se algum tenant criar override de permissão pra CLIENTE, a transition ainda precisa passar por row-level check.
