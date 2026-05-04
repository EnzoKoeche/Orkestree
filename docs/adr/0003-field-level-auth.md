# ADR-0003 — Field-level authorization via read models por role

- **Status**: Aceita
- **Data**: 2026-05-03
- **Categoria**: API

## Contexto

Proposals contêm dados sensíveis: custo interno, totalCost, margem. CLIENTE jamais pode ver isso. FINANCEIRO vê valor final mas não custo interno por padrão. Esconder no frontend é inseguro (qualquer chamada direta à API expõe). Mascarar com `null` no banco perde dados.

Era preciso uma estratégia de field-level authorization que mantenha os dados no banco e filtre no momento da resposta, com origem de verdade no backend.

## Decisão

**Read models / serializers condicionais por papel**, com dois mecanismos complementares:

**Mecanismo A — três selects role-aware no service** (uma projeção por fronteira de confiança):

- `*_PRIVILEGED` (OWNER/ADMIN): tudo, incluindo `totalCost`, `internalCost`, `notes` interno.
- `*_STANDARD` (FINANCEIRO/OPERACIONAL): notas internas, audit history, `approvedBy/rejectedBy`, **sem** custo interno (`totalCost`, `item.internalCost`).
- `*_CLIENT` (CLIENTE): subset estrito externo — sem notas internas, sem audit history, sem custo interno, sem motivo de rejeição. Coincide com o que vai pro PDF.

Cada service escolhe o select com `selectForRole(role)`. As três camadas são distintas: `STANDARD` é interno-operador, `CLIENT` é externo-cliente. Misturar as duas força regras condicionais no consumidor e cria precedente ruim.

**Mecanismo B — `FieldFilterInterceptor` global:**

Lê `SENSITIVE_FIELD_REGISTRY` (campo → `SensitiveField`) e tira campos sensíveis de qualquer resposta antes de sair, baseado em `PermissionResolverService.canSeeField`. Defense-in-depth.

**Regras adicionais:**

- **Nunca** confiar em frontend para esconder campos.
- PDFs para CLIENTE são gerados a partir de `ProposalClientView` exclusivamente.
- Custos/margens **permanecem no banco** — não mascarar com `null` na coluna.
- Adicionar campo sensível = entrada no registry + select correto no service.

## Consequências

- ✅ Segurança forte — dado sensível nunca sai pra quem não pode ver.
- ✅ Fonte única de verdade no backend.
- ✅ Mecanismo B pega esquecimentos do A (defense-in-depth real).
- ✅ Três projeções refletem fronteiras reais de confiança — nada de misturar regra interna-operador com regra externa-cliente.
- ❌ Mais código de read models / selects — três projeções por entidade sensível (list + detail × 3 = 6 constantes típicas).
- ❌ Exige rigor em manter views sincronizadas quando schema muda.
- ❌ Adicionar campo sensível tem checklist (registry, defaults, select certo entre os três, PDF).

## Alternativas consideradas

- **Esconder no frontend**: rejeitado — inseguro, qualquer chamada direta à API expõe.
- **Mascarar com null no banco**: rejeitado — perde dados, impossibilita queries internas, polui audit.
- **Apenas Mecanismo B (interceptor global)**: rejeitado — Mecanismo A é defesa primária; sem ele o dado vaza pra logs/traces antes do interceptor agir.

## Fonte

- Notion: [Field-level authorization via read models por role](https://www.notion.so/355b731e181581c08567f77a9a4c0469)
