# PR Checklist

Antes de abrir um PR no Orkestree, passe por esta lista. Não é cerimônia — cada item evitou bug ou retrabalho real.

## 1. Escopo

- [ ] PR tem **uma responsabilidade** clara. Refactor adjacente vira PR separado.
- [ ] Título descreve o "porquê" em < 70 caracteres.
- [ ] Descrição lista decisões aplicadas e riscos.

## 2. Tenant safety

- [ ] Toda query Prisma filtra por `companyId` no `where`.
- [ ] Todo raw SQL inclui `"companyId" = ${companyId}` no `WHERE`.
- [ ] `companyId` vem **sempre** de membership autenticada — nunca de payload do cliente.
- [ ] FKs novas que cruzam tabelas de domínio são compostas em `(companyId, id)` (raw SQL declarado no schema).

## 3. Field-level auth

- [ ] Selects do service são role-aware nos três tiers (`PRIVILEGED` / `STANDARD` / `CLIENT`) onde há campo sensível.
- [ ] Campo sensível novo está no `SENSITIVE_FIELD_REGISTRY` **e** só no select `*_PRIVILEGED`.
- [ ] PDF para CLIENTE usa **apenas** o select `*_CLIENT`.

## 4. Mutações críticas

- [ ] Mutação de lifecycle está dentro de `prisma.$transaction`.
- [ ] Linhas race-prone têm `SELECT … FOR UPDATE` antes da validação de estado.
- [ ] Audit gravado **dentro** da mesma transação via `ConfigAuditService.write(tx, …)`.
- [ ] Eventos `EventEmitter2.emit(...)` chamados **fora** do callback de `$transaction` (post-commit).
- [ ] Numbering sequencial usa `pg_advisory_xact_lock(hashtext('${companyId}:${entity}')::bigint)`.

## 5. CLIENTE row-level

- [ ] List/get filtram por `createdByMembershipId = membership.id` quando `role === CLIENTE`.
- [ ] Para entidades dependentes, filtro propagado pela relação (ex.: `where.serviceRequest = { createdByMembershipId: ... }`).
- [ ] Status que não devem aparecer pra CLIENTE estão filtrados (ex.: `Proposal.DRAFT`).

## 6. Build e schema

- [ ] `pnpm --filter @orkestree/api build` passa limpo.
- [ ] Se tocou frontend: `pnpm --filter @orkestree/web build` passa.
- [ ] `pnpm prisma migrate status` (no dir do api) sem drift.
- [ ] Migration nova é forward-compatible (não quebra versão atual em produção).

## 7. Diff hygiene

- [ ] Sem `console.log`, código comentado, ou TODO sem owner.
- [ ] Sem `include: true` em produção — só `select` explícito.
- [ ] Sem comentários narrando o que o código faz; só o **porquê** de decisões não-óbvias.
- [ ] Sem feature flag ou shim de backwards-compat se a mudança pode ser direta.

## 8. Testes

- [ ] Se há testes do módulo, novos comportamentos têm cobertura.
- [ ] Se testes em PR separado, **registrar como tarefa** no Notion.

## 9. Commit

- [ ] Mensagem de commit descreve "porquê", não "o quê".
- [ ] Co-author do Claude apenas quando aplicável.
- [ ] Sem `--no-verify` (hooks falham → consertar a causa, não pular).
- [ ] Sem `git commit --amend` após pre-commit hook ter falhado — criar commit novo.

## 10. Antes de pedir review

- [ ] Reler o próprio diff de cima a baixo, com olhar de revisor.
- [ ] Confirmar que riscos listados na descrição cobrem o que **ainda pode dar errado**, não só o que já testou.
