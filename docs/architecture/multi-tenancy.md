# Multi-tenancy

> Decisão: schema único + coluna `companyId`. Detalhes em [ADR-0002](../adr/0002-multi-tenancy-strategy.md).

## Modelo

- **User** é identidade global (login, email, senha).
- **Company** é o tenant.
- **CompanyMembership** liga User a Company com uma role (`OWNER`, `ADMIN`, `FINANCEIRO`, `OPERACIONAL`, `CLIENTE`) e um `status` (`ACTIVE`, etc.).
- Um User pode pertencer a várias Companies — cada uma é um workspace independente.
- Toda tabela de domínio tem coluna `companyId`.

## Invariantes

### Origem do `companyId`

`companyId` SEMPRE vem da `CompanyMembership` autenticada que o `CompanyMemberGuard` resolve a partir do JWT + `params.companyId`. **Nunca confiar em body, query ou param do cliente** para tenant scoping.

```ts
// ✅ certo
async listProposals(membership: CompanyMembership, query: ListProposalsDto) {
  return this.prisma.proposal.findMany({ where: { companyId: membership.companyId, ... } });
}

// ❌ errado — payload do cliente decide o tenant
async listProposals(dto: { companyId: string }) { … }
```

### Filtragem em queries

Toda query Prisma de domínio inclui `companyId` no `where`. Toda query raw inclui `"companyId" = ${companyId}`.

```ts
// ✅
const [row] = await tx.$queryRaw<Array<{...}>>`
  SELECT ... FROM "ServiceRequest"
  WHERE id = ${id} AND "companyId" = ${companyId}
  FOR UPDATE
`;
```

**O banco não tem trigger validando isso** — esquecer = vazamento silencioso.

### `CompanyMembership.isActive`

Lido sempre do DB no `CompanyMemberGuard`. **Nunca cacheado.** Uma membership desativada precisa ser rejeitada na hora, não dentro do TTL de cache.

### Constraints compostas

FKs que cruzam tabelas de domínio são **compostas em (`companyId`, `id`)** para impedir relacionar entidades de tenants diferentes:

```sql
ALTER TABLE "ProposalItem"
  ADD FOREIGN KEY ("companyId", "proposalId")
  REFERENCES "Proposal" ("companyId", "id") ON DELETE CASCADE;
```

Isso é a integridade no banco. A camada de aplicação ainda valida, mas o banco é a rede de segurança final.

## Numbering sequencial por tenant

Entidades como `ServiceRequest`, `Client`, `Proposal` têm `number` sequencial **por company**. Para serializar a geração:

```ts
await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${companyId + ':proposals'})::bigint)`;
const [{ max }] = await tx.$queryRaw`SELECT MAX(number)::int AS max FROM "Proposal" WHERE "companyId" = ${companyId}`;
const number = (max ?? 0) + 1;
```

A chave `${companyId}:${entity}` evita contenção entre fluxos diferentes da mesma company.

## CLIENTE — row-level filtering

Role `CLIENTE` vê apenas linhas que **a própria membership criou**. Aplicado em list/get adicionando `createdByMembershipId = membership.id` ao `where`.

Para entidades dependentes (ex.: `Proposal` → `ServiceRequest`), filtra através da relação:

```ts
where.serviceRequest = { createdByMembershipId: membership.id };
```

Combinado com filtros de status (ex.: proposals em `DRAFT` invisíveis para CLIENTE).

## Frontend ≠ autoridade

O frontend mantém `activeWorkspace` no store por conveniência. **Backend revalida em cada request** via `CompanyMemberGuard`. Trocar workspace no frontend não autoriza nada — o token JWT + a membership do banco sempre vencem.

## Evolução futura

Postgres Row-Level Security é uma camada adicional que pode ser ligada sem mudar o modelo. Não está ativa hoje porque a disciplina de `companyId` em todo lugar já dá a garantia, e RLS adicionaria complexidade de roles do banco.
