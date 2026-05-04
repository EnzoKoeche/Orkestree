# ADR-0006 — Event-driven via Outbox pattern + BullMQ

- **Status**: Aceita
- **Data**: 2026-05-03
- **Categoria**: Arquitetura

## Contexto

Operações pesadas (geração de PDF, envio de email, chamadas a IA, refresh de dashboard) não podem bloquear o request síncrono e precisam ser **resilientes** a falha temporária do worker, reinício de processo, e duplicação de eventos. Pub/Sub direto via Redis (sem outbox) tem risco de perder eventos se o publisher commitar no DB e cair antes do publish. Chamadas síncronas não escalam.

## Decisão

**Outbox Pattern + BullMQ:**

1. Operação síncrona grava no DB **e** em `OutboxEvent` na **mesma transação**.
2. Worker dedicado lê `OutboxEvent` em ordem e publica jobs no BullMQ (Redis).
3. Processors BullMQ consomem jobs e **delegam para domain services** (não duplicam lógica).

**Eventos-chave (planejados):**

- `service_request.created`
- `proposal.generated`
- `proposal.expired`
- `payment.created`
- `dashboard.refresh.requested`

**Regras:**

- Eventos só publicados **após commit** — em código direto (sem outbox), via `EventEmitter2.emit(...)` chamado fora do callback de `prisma.$transaction`.
- Quando o evento atravessa processo (worker), via `OutboxEvent` na mesma tx + worker poller.
- Processors são **idempotentes** — receber o mesmo evento duas vezes não pode causar efeito colateral duplo.
- Concorrência conservadora por padrão — só aumentar quando o domain service for explicitamente safe.

## Consequências

- ✅ Resiliência — evento sobrevive a queda do publisher antes do publish.
- ✅ Idempotência explícita — força o design correto.
- ✅ Escalabilidade — workers escalam horizontalmente.
- ✅ Observabilidade — `OutboxEvent` é histórico inspecionável.
- ❌ Eventual consistency — UI do operador pode ver request criado antes do PDF estar pronto.
- ❌ Complexidade operacional — Redis + workers + monitoramento de fila.
- ❌ Latência adicional para ações que precisam de feedback imediato (mitigado emitindo eventos UI separados via WebSocket).

## Alternativas consideradas

- **Pub/Sub direto via Redis sem outbox**: rejeitado — risco de perder eventos se o publisher cair entre commit e publish.
- **Chamadas síncronas**: rejeitado — bloqueia o request HTTP, não escala, e amarra a UX à performance de jobs pesados.

## Fonte

- Notion: [Event-driven via Outbox pattern + BullMQ](https://www.notion.so/355b731e1815816d9d01fb9daa23346b)

## Nota de implementação

Em maio/2026 o backend usa `EventEmitter2` direto (in-process) para eventos como `proposal.created`, `proposal.transitioned`, `request.created`, etc. — emitidos fora do callback de `$transaction` (post-commit). A tabela `OutboxEvent` e o worker dedicado estão na direção arquitetural mas ainda não foram materializados; ficam para quando algum evento precisar atravessar processo (ex.: integração com worker BullMQ separado para PDF/email).
