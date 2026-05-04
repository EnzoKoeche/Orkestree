# ADR-0001 — Modular Monolith ao invés de microserviços

- **Status**: Aceita
- **Data**: 2026-05-03
- **Categoria**: Arquitetura

## Contexto

Necessidade de definir o paradigma arquitetural inicial do projeto. A pressão era escolher entre microserviços desde o começo (escalabilidade futura, isolamento de falhas), arquitetura em camadas tradicional (familiar mas sem desacoplamento por eventos), ou monólito modular com event-driven interno.

A prioridade explícita do produto é **correção, consistência e velocidade** — não complexidade distribuída prematura.

## Decisão

Adotar **modular monolith** com event-driven interno via Outbox pattern + BullMQ (ver [ADR-0006](./0006-event-driven-outbox-bullmq.md)).

- Módulos verticais com fronteiras claras: controller, service, dto, policy, listener, repository.
- Eventos internos via Outbox → BullMQ workers.
- Apps separados: `apps/api` e `apps/worker`, mesma base de código.
- Deploy independente possível depois.

## Consequências

- ✅ Velocidade de MVP — sem overhead de orquestração distribuída.
- ✅ Consistência transacional — uma transação Postgres cobre operação + outbox + audit.
- ✅ Simplicidade operacional — menos infraestrutura, menos modos de falha.
- ✅ Caminho aberto pra extrair serviços conforme módulos cresçam.
- ❌ Acoplamento físico no início — todos os módulos compartilham processo.
- ❌ Escalabilidade horizontal limitada por módulo — escalar só uma parte exige extração.

## Alternativas consideradas

- **Microserviços desde o início**: rejeitado por adicionar latência, complexidade operacional, e custo de coordenação antes do produto justificar.
- **Arquitetura em camadas tradicional sem eventos**: rejeitado por acoplar fortemente operações pesadas (PDF, IA, email) ao request síncrono.

## Fonte

- Notion: [Modular Monolith ao invés de microserviços](https://www.notion.so/355b731e18158189b466e2f9813153c6)

## Nota de implementação

Em maio/2026 o repo tem apenas `apps/api`. `apps/worker` mencionado na decisão ainda não foi materializado — jobs assíncronos são planejados mas ainda não estão wired ao `AppModule`. Ver [ADR-0006](./0006-event-driven-outbox-bullmq.md) sobre a fila (Bull v4 hoje, BullMQ no roadmap).
