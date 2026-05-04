---
name: orkestree
description: Convenções e invariantes do Orkestree (NestJS modular monolith, Prisma, multi-tenant por companyId, field-level auth role-aware). Use sempre que tocar código backend ou frontend deste projeto.
---

# Orkestree — Convenções e invariantes

SaaS multi-tenant para empresas de serviço. Stack: NestJS modular monolith + Prisma + Postgres + Redis + **Bull v4** (`@nestjs/bull` + `bull@4`; migração pra BullMQ no roadmap). Frontend Next.js 14 App Router (planejado). Roles: OWNER, ADMIN, FINANCEIRO, OPERACIONAL, CLIENTE.

## Always check first

- Estado real do repo é a fonte da verdade. Confirme módulos com `Glob`/`Grep`/`Read` antes de assumir que existem.
- Não confie em planos de conversas antigas. Qualquer "já merged" precisa ser verificado no branch atual.
- Antes de editar: leia o módulo análogo já estável (`service-requests`, `clients`, `company-config`, `proposals`) e copie o estilo.

## Backend invariants

- `companyId` SEMPRE vem de membership autenticada (`@CurrentMembership()` / `request.companyMembership`). NUNCA de body/query/param.
- Prisma `select` explícito sempre. Proibido `include: true` em produção.
- Mutações de lifecycle críticas:
  - `prisma.$transaction` + `SELECT … FOR UPDATE` (raw) na entidade afetada antes de validar estado.
  - Audit gravado **dentro** da mesma tx via `ConfigAuditService.write(tx, …)`.
  - Eventos via `EventEmitter2.emit(...)` **apenas após o commit** (fora do callback de `$transaction`).
- Numbering sequencial por tenant: advisory lock `pg_advisory_xact_lock(hashtext('${companyId}:${entity}')::bigint)` antes do `MAX(number)+1`.
- Tenant safety em raw SQL: todo `SELECT/UPDATE/DELETE` raw deve filtrar `"companyId" = ${companyId}`. Não há trigger no banco — esquecer = vazamento silencioso.

## Field-level auth (CRÍTICO)

**Mecanismo A — três selects role-aware** (em cada service que carrega dado sensível):
- `*_PRIVILEGED` (OWNER/ADMIN): inclui `totalCost`, `item.internalCost`, margem.
- `*_STANDARD` (FINANCEIRO/OPERACIONAL): notas internas + audit history + `approvedBy/rejectedBy`, **sem** custo interno.
- `*_CLIENT` (CLIENTE): subset estrito externo (sem notas internas, sem audit history, sem custo, sem rejection reason). Coincide com o que vai pro PDF.
- Helper `selectForRole(role)` escolhe entre os três. **Não juntar `STANDARD` e `CLIENT`** — são fronteiras de confiança diferentes (interno-operador vs externo-cliente).

**Mecanismo B — `FieldFilterInterceptor`** registrado globalmente em `main.ts`. Lê `SENSITIVE_FIELD_REGISTRY` (em `company-config/permissions/sensitive-field.registry.ts`) e tira o campo se a role não tem `canSeeField`. Defense-in-depth — não substitui o Mecanismo A.

**Regras:**
- Frontend NUNCA é authority pra esconder campos.
- PDF gerado para CLIENTE jamais expõe `totalCost`, `internalCost`, ou `notes` interno.
- Adicionar campo sensível = uma entrada no registry + adicionar **só** ao select `*_PRIVILEGED` do service que retorna ele.

## Proposal-specific rules

- Apenas `DRAFT` é editável. Todo mutator (proposal e items) faz `SELECT … FOR UPDATE` + checa status antes de gravar.
- Totais (`subtotal`, `totalPrice`, `totalCost`) sempre recomputados server-side em `ProposalItemsService.recomputeProposalTotals`. Decimal `ROUND_HALF_EVEN`, 2 casas.
- `discountPct` e `discountAmount` são mutuamente exclusivos: setar um zera o outro.
- Lifecycle: `DRAFT → SENT → APPROVED|REJECTED|CANCELLED`; `EXPIRED` é setado apenas pelo job de expiry — rejeitar via API com 422.
- `APPROVED` exige permissão `PROPOSAL.APPROVE`. `REJECTED` exige `PROPOSAL.REJECT`. (`PROPOSAL.EDIT` é o gate base do controller.)
- Partial unique `udx_one_approved_proposal_per_request`: P2002 → mapear para 409 Conflict.
- CLIENTE row-level: filtrar por `serviceRequest.createdByMembershipId = membership.id`. Proposals em `DRAFT` ficam invisíveis pra CLIENTE.
- `SENT` exige ≥ 1 item.

## Module style (siga service-requests / company-config / proposals)

- Estrutura: `module.ts`, `*.controller.ts`, `*.service.ts` (+ services especializados, ex.: `*-transitions.service.ts`, `*-items.service.ts`), `dto/`.
- Controller: `@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)` + `@Controller('companies/:companyId/<resource>')` + `@RequirePermission(...)`.
- DTOs com `class-validator`; `ValidationPipe` global já com `whitelist + forbidNonWhitelisted + transform`.
- Services pequenos e responsivos a uma fatia do domínio. Transitions e mutações pesadas em arquivos próprios.
- **Exceção consciente: `MembershipsController` é anêmico** (read-only, sem service). Quando adicionar mutações (invite/revoke/role-change), criar `MembershipsService` para carregar transação + audit + eventos pós-commit.

## Frontend rules

- Só consumir endpoints que existem. Se algo falta, **sinalizar o gap** explicitamente — não inventar API silenciosamente.
- Backend é source of truth pra totais e autorização. UI é convenience.
- Edição de proposta só em DRAFT (espelho do backend).
- Estados: loading / empty / error explícitos em listas e detalhes.

## Gotchas (erros que já aconteceram nesta base)

- Esquecer `companyId` em raw SQL = vazamento sem alarme (sem trigger no banco).
- **Composite FKs `(companyId, X)` vivem em migrations SQL puro**, não no `schema.prisma`. Antes de adicionar relações novas, conferir as migrations — comentários `// Raw SQL: FK ...` no schema indicam quais existem.
- **Bull v4, não BullMQ.** `package.json` tem `@nestjs/bull` + `bull@4`. Imports `from 'bullmq'` quebram. APIs diferentes (Worker vs Process, QueueEvents, etc.).
- **`Proposal.notes` interno NÃO está no `SensitiveField` enum.** É protegido apenas pelo Mecanismo A (select role-aware). Esquecer o select certo num PDF ou rota nova vaza sem o `FieldFilterInterceptor` pegar.
- `Decimal` serializa como string em JSON; não compare com `number` direto no frontend nem em testes.
- Transitions sem row-level check vazam se algum tenant ativar override de permissão para CLIENTE — sempre considerar o pior caso de override.
- `updateProposal` com discount mas sem itens devolve totais zerados — comportamento intencional, não regressão.
- Pular `pnpm prisma migrate status` antes do PR esconde drift entre `schema.prisma` e DB real.
- Amend de commit após pre-commit hook falhar pode destruir trabalho — sempre criar commit novo.

## PR discipline

- PR estreito: uma responsabilidade por PR. Refactor adjacente vai em PR separado.
- Build limpo antes de commit: `pnpm --filter @orkestree/api build` (e `pnpm --filter @orkestree/web build` quando tocar frontend).
- Testes podem ir em PR seguinte, mas registrar como tarefa explícita.
- Antes do commit: listar **decisões aplicadas** e **riscos** ao usuário.
- Mensagem de commit: foco no "porquê", não no "o quê".

## Notion como cérebro externo

- Página principal: **🧠 Orkestree — Cérebro do Projeto**.
- 4 databases:
  - **Decisões Técnicas** (status: Proposta / Aceita / Revisada / Revogada)
  - **Tarefas** (TODO / Doing / Done / Blocked)
  - **Bugs Conhecidos** (severidade: Baixa / Média / Alta / Crítica)
  - **Sessões Claude Code**
- Início de sessão: ler Decisões em "Aceita" relevantes + Tarefas TODO + Bugs com severidade Alta/Crítica antes de propor mudanças.
- Fim de sessão: registrar resumo + próximos passos + atualizar Tarefas/Bugs tocados. Decisão nova → criar entrada em "Decisões Técnicas".

## Reflexo na revisão

Quando revisar um diff próprio antes de entregar, verifique:
1. `companyId` está em todo `where` e em todo raw SQL?
2. Selects são role-aware nos três tiers (`PRIVILEGED`/`STANDARD`/`CLIENT`)? Campo sensível novo está no registry e só no `*_PRIVILEGED`?
3. Mutação crítica está dentro de `$transaction` com `FOR UPDATE`?
4. Eventos saem após commit?
5. Audit foi gravado na mesma tx?
6. CLIENTE row-level filter está aplicado em list/get?
7. Build passa?
