# ADR-0007 — AIService provider-agnostic com adapters

- **Status**: Aceita
- **Data**: 2026-05-03
- **Categoria**: Stack

## Contexto

IA será usada para gerar propostas, sumarizar service requests e sugerir checklists. O cenário de modelos muda rápido (OpenAI, Anthropic, Gemini, providers locais). Clientes Enterprise podem querer **BYO-AI** (trazer a própria chave/provider, por compliance ou contrato existente).

Acoplar a um provider específico simplifica o MVP mas amarra o produto ao roadmap de um fornecedor.

## Decisão

`AIService` central **provider-agnostic** com adapters:

- Interface única `AIService` no domínio.
- Adapters: OpenAI, Anthropic, Gemini, custom (futuro).
- Configuração por empresa: provider, key, model.
- Plano Enterprise permite BYO-AI key.

**Escopo limitado no MVP:**

- Geração de proposta a partir de service request.
- Sumarização de service request.
- Sugestão de checklist.

*Não é um "chat com IA genérico" exposto ao usuário final no produto.*

## Consequências

- ✅ Troca fácil de provider — cada um é um adapter.
- ✅ BYO-AI viável — atrativo para Enterprise.
- ✅ Provider-neutral — não amarrado a roadmap de um fornecedor.
- ✅ Testes mais fáceis — adapter mock substitui provider real.
- ❌ Adapter layer adiciona indireção e código de tradução de tipos.
- ❌ Risco de **lowest-common-denominator** — features novas de um provider (ex.: structured output, vision) ficam atrás de feature flags ou exigem extensão da interface.
- ❌ Custo de manter mais de um adapter atualizado conforme APIs evoluem.

## Alternativas consideradas

- **Acoplar a um provider específico** (mais simples, menos flexível): rejeitado — barra clientes Enterprise e amarra evolução do produto a uma única roadmap externa.

## Fonte

- Notion: [AIService provider-agnostic com adapters](https://www.notion.so/355b731e181581009f9eed6fb1dcb58f)
