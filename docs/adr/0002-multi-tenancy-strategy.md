# ADR-0002 — Multi-tenancy por companyId em schema único

- **Status**: Aceita
- **Data**: 2026-05-03
- **Categoria**: Arquitetura

## Contexto

Multi-tenancy é crítica para o produto. Era preciso definir a estratégia de isolamento entre clientes do SaaS antes de modelar qualquer entidade.

Três abordagens estavam na mesa: schema único com `companyId`, schema-per-tenant (Postgres schemas), e database-per-tenant.

## Decisão

Adotar **schema único** com coluna `companyId` em toda tabela de domínio.

- `companyId` é parte de **toda** entidade de domínio.
- Isolamento aplicado em **lógica de aplicação** (guards, services) **e** **integridade de banco** (constraints compostas em `(companyId, id)`).
- `companyId` SEMPRE vem de membership autenticado, **nunca** de payload do cliente.
- User é identidade global; acesso operacional via `CompanyMembership`.
- Um user pode pertencer a múltiplas empresas/workspaces.
- Frontend NÃO é autoridade de tenant — apenas conveniência de UX.
- Evolução futura: Postgres Row-Level Security pode ser adicionado sem mudar o modelo.

## Consequências

- ✅ Operacionalmente simples — uma única instância, um único pool de conexão, migrations únicas.
- ✅ Backups, métricas, alertas centralizados.
- ✅ Migrar tenant entre planos/regiões é mais fácil que com schemas separados.
- ❌ **Risco de leak** se o isolamento não for aplicado em todo lugar — exige disciplina e revisão constante (não há trigger no banco que avise).
- ❌ Algumas queries pesadas precisam pensar em índices compostos com `companyId` na frente.

## Alternativas consideradas

- **Schema-per-tenant** (Postgres schemas): rejeitado pelo overhead de migrations × N tenants e pela complexidade de pool de conexão.
- **Database-per-tenant**: rejeitado por inviabilizar economia de infra e dificultar features cross-tenant futuras (ex.: marketplace, analytics agregada).

## Fonte

- Notion: [Multi-tenancy por companyId em schema único](https://www.notion.so/355b731e18158101b8c3e851f919d2b8)
