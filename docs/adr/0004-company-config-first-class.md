# ADR-0004 — company-config como módulo first-class com entidades relacionais

- **Status**: Aceita
- **Data**: 2026-05-03
- **Categoria**: Arquitetura

## Contexto

Cada empresa precisa configurar workflows, tipos de serviço, campos de formulário, templates, regras de automação e permissões próprias. Configuração operacional por empresa precisa ser **flexível, mas tipada e auditável**.

A escolha era entre tratar config como dados livres (campo `settings JSONB` por empresa, key-value store) ou modelar com entidades relacionais.

## Decisão

Criar módulo forte **`company-config`** (não um campo `settings JSON`) com entidades versionáveis:

- `ServiceType`, `ServiceCatalog`
- `CustomFieldDefinition`, `CustomFieldOption`, `CustomFieldValue`
- `Workflow`, `WorkflowStage`, `WorkflowStageAssigneeRule`
- `ProposalTemplate`, `DocumentTemplate`
- `AutomationRule`
- `RolePermission`, `UserPermissionOverride`

Este módulo estabelece o **style guide do projeto** para: DTOs, guards, service layering, transaction boundaries, projeções Prisma explícitas. Outros módulos (proposals, service-requests, clients) seguem o mesmo padrão.

## Consequências

- ✅ Tipagem forte — schema valida o que JSON livre não valida.
- ✅ Integridade referencial — workflows/stages/permissions com FKs reais.
- ✅ Versionamento e auditoria via `ConfigAuditService`.
- ✅ Queries diretas em config (ex.: "todas companies usando service type X").
- ✅ Migration explícita quando schema de config evolui.
- ❌ Mais tabelas e migrations.
- ❌ Complexidade inicial maior — adicionar nova capacidade exige migration, não só `JSON.set`.

## Alternativas consideradas

- **Campo `settings JSONB` por empresa**: rejeitado — perde tipagem, validação, integridade referencial, e fica difícil de consultar/auditar.
- **Key-value store por feature**: rejeitado — abstração rasa que não captura as relações entre workflow, stage, e permissão.

## Fonte

- Notion: [company-config como módulo first-class com entidades relacionais](https://www.notion.so/355b731e18158122a5ead399bfbb5c8f)
