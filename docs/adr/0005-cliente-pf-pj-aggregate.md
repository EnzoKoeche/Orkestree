# ADR-0005 — Cliente PF/PJ via aggregate + sub-perfis

- **Status**: Aceita
- **Data**: 2026-05-03
- **Categoria**: Database

## Contexto

Clientes podem ser pessoa física (PF) ou jurídica (PJ). Cada tipo tem campos e validações distintas (CPF vs CNPJ, nome vs razão social, RG vs IE/IM, etc.). Modelar com tabela única e todos os campos `nullable` resulta em uma sparse table fraca, sem validação de tipo e com many-nullable rows que confundem queries.

## Decisão

Aggregate `Client` com sub-perfis especializados:

- `Client` — campos comuns (`type`, `email`, `phone`, `companyId`, `isActive`, número sequencial).
- `ClientIndividualProfile` — específico de PF: CPF, nome completo, RG, data de nascimento.
- `ClientBusinessProfile` — específico de PJ: CNPJ, razão social, nome fantasia, IE, IM.
- `ClientAddress` — múltiplos endereços por cliente, com tipo: `PRIMARY | FISCAL | BILLING | SERVICE | OTHER`.

Enum `ClientType`: `INDIVIDUAL | BUSINESS`.

`Client.type` é **imutável após criação** — enforçado no service.
`Client.name` é denormalizado:
- INDIVIDUAL → `dto.name`
- BUSINESS → `dto.tradeName ?? dto.legalName`

## Consequências

- ✅ Tipagem forte — campos PF e PJ não se misturam.
- ✅ Validações específicas por tipo (CPF 11 dígitos, CNPJ 14, etc.).
- ✅ Suporta múltiplos endereços com semântica clara (fiscal vs billing vs service).
- ✅ Modelo extensível — adicionar perfil novo (ex.: `ClientGovernmentProfile`) sem migration disruptiva.
- ❌ Joins extras nas queries que precisam de campos de perfil.
- ❌ Lógica de profile no service layer (compute display name, validate by type).

## Alternativas consideradas

- **Tabela única `Client` com todos os campos nullable**: rejeitado — sparse, sem validação de tipo, queries poluídas com `IS NOT NULL`.
- **Tabelas separadas `IndividualClient`/`BusinessClient` sem aggregate**: rejeitado — fragmenta a noção de "cliente" e quebra relacionamentos genéricos (ex.: `ServiceRequest.clientId` precisaria de polimorfismo).

## Fonte

- Notion: [Cliente PF/PJ via aggregate + sub-perfis](https://www.notion.so/355b731e1815817fbc3de3383b825dbf)

## Nota de implementação

Em maio/2026 a implementação efetiva no `apps/api/src/clients` mantém os campos PF/PJ direto na tabela `Client` (`legalName`, `tradeName`, `taxId`, `dateOfBirth`, etc.) com `type` discriminando. Os sub-perfis e o `ClientAddress` separado seguem como direção arquitetural a ser materializada quando crescer a complexidade — vale conferir o estado real do schema (`apps/api/prisma/schema.prisma`) antes de basear código nesse ADR.
