---
name: orkestree
description: Convenções e invariantes do Orkestree (NestJS modular monolith, Prisma, multi-tenant por companyId, field-level auth role-aware). Use sempre que tocar código backend ou frontend deste projeto.
---

# Orkestree — Convenções e invariantes

SaaS multi-tenant para empresas de serviço. Stack: NestJS modular monolith + Prisma + Postgres + Redis + **BullMQ** (`@nestjs/bullmq` + `bullmq@5`). Frontend Next.js 14 App Router (planejado). Roles: OWNER, ADMIN, FINANCEIRO, OPERACIONAL, CLIENTE.

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
- **Padrão de leitura de env vars**:
  - **Bootstrap factories** (`forRoot`, `forRootAsync` no `AppModule`) leem `process.env` DIRETO. Ex: `BullModule.forRootAsync`, `RedisModule.forRoot`, qualquer `JwtModule.registerAsync` futuro.
  - **Runtime services** (qualquer `@Injectable` consumido após bootstrap) usam `ConfigService.get()` via DI.
  - Razão: factories de bootstrap podem rodar antes do DI estar completo. `process.env` já está populado pelo `ConfigModule.forRoot` (que é o PRIMEIRO import do AppModule, garantia do PR #16), mas `ConfigService` nem sempre é injetável de forma confiável em factories de mesmo nível.
  - Estabelecido no PR #16 (ConfigModule wiring) e seguido por todos os módulos de infra (Redis, Bull, futuro JWT factory). Misturar `ConfigService` em uma factory enquanto outra usa `process.env` no mesmo AppModule é inconsistência — ou padroniza tudo, ou mantém o padrão.

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
- Stack: Next.js 14 App Router + Tailwind + shadcn/ui (style: New York, baseColor: neutral) + lucide-react + react-hook-form + zod + sonner + next-intl.
- **Indigo (`hsl(239 84% 67%)`) é override APENAS em `--primary` e `--ring`.** Resto da paleta neutral. Indigo aparece em: Logo (ponto), botão `variant="default"`, focus rings. Em qualquer outro lugar é violação.
- Active nav state: 3 sinais empilhados (`bg-secondary` + `text-foreground` + `font-medium`). NUNCA strip indigo lateral, NUNCA acento de cor.
- Inputs `h-10 text-base` (16 px) — text-base é obrigatório pra evitar iOS Safari auto-zoom no focus.
- Cookie de sessão (`orkestree_session`) é pra middleware ler. localStorage (`orkestree.session.v1`) é pra SessionProvider hidratar. Active company é separado (`orkestree.active_company.v1`).

## Princípios de Frontend Design (10 princípios)

Aplicados em toda UI desde Frontend Semana 1. Antes de criar/editar componente UI: revisar quais aplicam, materializar conscientemente.

1. **Intencionalidade > genericidade.** Nenhuma decisão visual por default. Todo padding, tamanho de fonte, escolha de componente é justificado. Padrões shadcn são ponto de partida, não destino.
2. **Hierarquia visual clara.** Primário, secundário, terciário em cada tela via tamanho, peso, cor, espaçamento. Operador deve saber em <2 s qual ação importa mais.
3. **Densidade intencional.** Linear é denso (dev), Notion é espaçoso (lifestyle), Orkestree é meio-termo. Listas ~52-56 px row height, cards p-6 a p-8, nav h-9.
4. **Tipografia com propósito.** Inter via `next/font/google`. Body 14 px (text-sm), inputs 16 px (text-base — anti-zoom), labels 14 px medium, títulos 24-32 px semibold, números em tabelas tabular-nums. Pesos 400/500/600. NUNCA 700 em texto longo. NUNCA italic em UI.
5. **Cor com restrição.** Neutros dominam (95% da tela). Indigo é EVENTO (botão Entrar, focus ring), não decoração. Status colors (red/amber/emerald) são raros e contextuais.
6. **Espaçamento rítmico.** Múltiplos de 4 px (4/8/12/16/24/32/48). Espaçamento entre seções > entre items > entre linhas. White space é design.
7. **Animações invisíveis.** 150 ms ease-out padrão. Hover/focus/active subtle. NUNCA bounce, spring, dramatic transitions. Loading: skeleton > spinner pra page-level; spinner inline pequeno OK pra status.
8. **Acessibilidade como linha de base.** Contraste WCAG AA mínimo. Focus visível (`focus-visible:ring-2`). aria-labels em ícones standalone. role/aria-live apropriados em alert/status. Keyboard nav funcional.
9. **Microcopy como UX.** Linguagem de negócio, NÃO técnica. Erros humanos. Empty states explicativos. Botões com verbo de ação ("Criar pedido", não "Submeter"). Ver tabela de convenções abaixo.
10. **Logo como marca.** Distintivo, reconhecível, escalável. Storyline visual (centro orquestrador). Funcional em mono (1 cor) sem perder identidade.

## Microcopy PT-BR convenções

Linguagem do **operador leigo** (dono de empresa de serviços, não dev, não PM técnico). Mapeamento técnico → humano:

| ❌ Técnico | ✅ Humano |
|---|---|
| ServiceRequest | Pedido / Solicitação |
| ServiceType | Tipo de serviço |
| Workflow | Fluxo de trabalho |
| Stage / Stage transition | Etapa / Mudar etapa |
| Proposal DRAFT | Proposta em rascunho |
| Proposal SENT | Proposta enviada |
| Proposal APPROVED | Proposta aprovada |
| Proposal REJECTED | Proposta recusada |
| Membership | Acesso à empresa |
| Tenant / CompanyMembership | Empresa / Membro |
| Field validation failed | Verifique os campos abaixo |
| 401 Unauthorized | Sua sessão expirou. Entre novamente. |
| 403 Forbidden | Você não tem permissão para essa ação. |
| 404 Not Found | Não encontramos o que você procura. |
| 409 Conflict | Esse item já foi alterado por outra pessoa. |
| 429 Too Many Requests | Muitas tentativas. Aguarde alguns segundos e tente novamente. |
| 500 Internal Server Error | Algo deu errado. Tente novamente em instantes. |
| Network error | Sem conexão. Verifique sua internet. |
| TaskAssignment | Atribuição |
| RolePermission | Permissão da função |

**Erros remotos** (HTTP) → toast via sonner. **Erros de validação** (zod) → inline abaixo do input com `role="alert"`. **Sucesso de login** NÃO usa toast (B2B premium não celebra). **Logout** sem confirm dialog (operador clicou intencionalmente).

## Antes de criar componente UI — checklist

Aplicar antes de codar QUALQUER componente novo (página, modal, form, lista). Se a resposta a algum item for genérica, parar e refinar.

1. **Quais dos 10 princípios se aplicam?** Liste explicitamente os 3-5 mais relevantes pro componente.
2. **Como esses princípios se materializam em código?** Tamanhos exatos, classes Tailwind, composição shadcn, branches de render. Nada genérico.
3. **Qual a microcopy PT?** Toda string visível registrada em `messages/pt.json`. Linguagem de negócio. Erros amigáveis. Ver tabela acima.
4. **Reportar ANTES de codar.** Aguardar OK do usuário no plano antes de gerar arquivo. Se voltar com refinement, aplicar antes de codar.

Estabelecido em sessão 2026-05-05 (Frontend Semana 1) após auditoria de Fase 3 que revelou 4 violações em código já commitado (corrigidas via fixup). Esse processo evita re-trabalho.

## Visão consolidada do produto

Para qualquer decisão de produto / posicionamento / fasing, a fonte de verdade é:

- **Notion** (ativo, sempre atualizado): página "🎯 Visão Consolidada do Orkestree (2026-05-05)" id `358b731e-1815-8196-bc62-fd7cef4fe111`.
- **Obsidian vault** (snapshot offline): `<vault>/01-visao-produto.md`.
- **Plano de captação:** Notion "💼 Plano de Captação — Network da Mãe" id `358b731e-1815-81fb-94e1-c849b62a190d` + `<vault>/02-captacao-investidores.md`.

Resumo do que é decidido e estável:
- 3 personas: dono empresa cliente / operador (foco MVP visual) / cliente final.
- 4 tiers de plano (Free / Starter / Pro / Enterprise).
- Marketplace + score mútuo + chat privado **em V1** (não posterga).
- IA em V1.5 (BYOK), Google Calendar V2.
- Configurabilidade Versão A (templates fixos por vertical, não builder visual).
- Verificação de documentos por vertical (CNPJ + ANVISA / CREA / alvará conforme aplicável).
- Cliente piloto: vertical impressão 3D hospitalar.
- Reserva 6-8 meses. Foco abandona PIBEP. Mentoria-first antes de captar.

Antes de propor arquitetura ou feature que toque qualquer um desses temas: ler a fonte de verdade do Notion. Decisões anteriores conflitantes foram substituídas em 2026-05-05.

## Gotchas (erros que já aconteceram nesta base)

- Esquecer `companyId` em raw SQL = vazamento sem alarme (sem trigger no banco).
- **Composite FKs `(companyId, X)` vivem em migrations SQL puro**, não no `schema.prisma`. Antes de adicionar relações novas, conferir as migrations — comentários `// Raw SQL: FK ...` no schema indicam quais existem.
- **Composite FKs em raw SQL precisam de UNIQUE target explícito.** Schema Prisma só conhece FKs simples; antes de adicionar FK composta numa migration manual, GARANTE que o `UNIQUE("companyId", "id")` (ou equivalente) já existe na tabela alvo (criado via `ALTER TABLE … ADD CONSTRAINT uq_…` em migration anterior ou nessa mesma, antes do `ADD FOREIGN KEY`). Comentário `// Raw SQL: UNIQUE ...` no schema indica **intent**, **NÃO** implementação. Auditar o SQL completo antes de aplicar — bug latente custou 1 sessão pra debugar.
- **Schema tem enums declarados preventivamente para módulos não implementados** (ex.: `PdfTemplateType`, `TemplateEngine`). Existência do enum NÃO indica que o módulo está pronto. Verificar código consumidor + existência da tabela associada antes de assumir feature funcional.
- **Migrations: ordem é lexicográfica** (`00_`, `01_`, `02_`, ...). `prisma migrate dev` gera com timestamp — convenção mista hoje. Ao adicionar nova migration manual, manter prefixo numérico em ordem. Migration baseline criada em 2026-05-04 via `prisma migrate diff --from-empty` (não `migrate dev`) pra preservar nome `00_baseline`. Se usar `migrate dev` no futuro, considera renomear a pasta gerada pra manter convenção.
- **BullMQ Workers são separados de Queues.** Producer (`Queue`, via `@InjectQueue(NAME)`) e consumer (`@Processor(NAME)` extending `WorkerHost`) podem viver em apps diferentes (`apps/worker` futuro). Em `apps/api` hoje os 2 vivem juntos no mesmo módulo (`ProposalJobsModule`). Quando separar, processor migra pro app/worker e o `BullModule.registerQueue` da API fica só com producer — connection segue compartilhada via `REDIS_URL`. Repeatable cron usa `{ repeat: { pattern: '*/5 * * * *' } }` (BullMQ 5), não `{ cron }` (Bull v4).
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
