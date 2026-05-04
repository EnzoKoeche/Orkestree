# Architecture Decision Records

ADRs registram **decisões arquiteturais consolidadas** com contexto, alternativas consideradas, e consequências. Decisões em formação ficam no Notion (database "🏛️ Decisões Técnicas"); migram pra cá quando estabilizam.

## Formato

Cada ADR segue este esqueleto:

```markdown
# ADR-NNNN — Título curto

- **Status**: Proposta | Aceita | Revisada | Revogada
- **Data**: YYYY-MM-DD
- **Categoria**: Arquitetura | Stack | Database | API | Frontend | DevOps | Outro

## Contexto
Por que essa decisão foi necessária. Qual o problema, restrição, ou oportunidade.

## Decisão
A decisão tomada, em linguagem clara e ativa.

## Consequências
Resultados esperados. O que muda no dia-a-dia. Trade-offs (✅ prós / ❌ contras).

## Alternativas consideradas
Outras opções avaliadas e por que foram preteridas.

## Fonte
- Notion: <link da decisão original no database "🏛️ Decisões Técnicas">
```

## Regras

- **ADRs são imutáveis depois de `Aceita`.** Para mudar uma decisão, criar um novo ADR (`Revisada` ou `Revogada`) e linkar cruzado.
- Numeração sequencial (`0001`, `0002`, …). Nunca reusar número.
- Nome do arquivo: `NNNN-titulo-em-kebab.md`.
- Toda ADR linka a página Notion de origem na seção "Fonte" — preserva o histórico de discussão.

## Quando criar um ADR

Crie ADR quando uma decisão atende a TODOS:

1. Tem impacto **transversal** (mais de um módulo afetado, ou regra que vai durar).
2. **Foi implementada** (não é especulação).
3. **Estabilizou** (já passou pelo menos uma vez por código real e não foi rejeitada).

Decisões locais a um módulo, ou que ainda não foram implementadas, ficam só no Notion.

## Índice

- [0001 — Modular Monolith ao invés de microserviços](./0001-modular-monolith.md)
- [0002 — Multi-tenancy por companyId em schema único](./0002-multi-tenancy-strategy.md)
- [0003 — Field-level authorization via read models por role](./0003-field-level-auth.md)
- [0004 — company-config como módulo first-class com entidades relacionais](./0004-company-config-first-class.md)
- [0005 — Cliente PF/PJ via aggregate + sub-perfis](./0005-cliente-pf-pj-aggregate.md)
- [0006 — Event-driven via Outbox pattern + BullMQ](./0006-event-driven-outbox-bullmq.md)
- [0007 — AIService provider-agnostic com adapters](./0007-ai-service-provider-agnostic.md)
