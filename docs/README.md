# Orkestree — Documentação técnica

Esta pasta é **documentação versionada que vive com o código**. Ela é o complemento do *cérebro externo* do projeto no Notion.

## Sistema de conhecimento dual

O Orkestree usa dois sistemas de conhecimento, cada um com responsabilidade clara:

| Sistema | Função | Vive onde |
|---|---|---|
| **`docs/` (este repo)** | Documentação técnica estável: arquitetura, ADRs, runbooks, schema docs | Markdown no git, viaja com o código |
| **Notion — "🧠 Orkestree — Cérebro do Projeto"** | Gestão operacional: tarefas, bugs, sessões, decisões em formação | Notion workspace, fora do git |

**Regra de fluxo:**

1. **Decisões nascem no Notion** — rápido, baixa fricção, sem PR. Vão pro database "🏛️ Decisões Técnicas" como `Proposta` ou `Aceita`.
2. **Quando uma decisão estabiliza** (status `Aceita` + implementada e validada na prática), ela vira **ADR** em `docs/adr/`. O ADR cita a página Notion como fonte original.
3. **Tarefas e bugs nunca entram no repo.** Vivem em "✅ Tarefas" e "🐛 Bugs Conhecidos" no Notion.
4. **Sessões Claude Code** ficam em "💬 Sessões Claude Code" no Notion. Resumos não poluem o histórico do git.

## Estrutura

```
docs/
├── README.md                      ← este arquivo
├── architecture/                  ← high-level, "como o sistema funciona"
│   ├── overview.md                  resumo do projeto, links pra detalhes
│   ├── multi-tenancy.md             companyId, isolamento, invariantes
│   ├── field-level-auth.md          mecanismos A e B, registry, roles
│   └── proposals.md                 regras do módulo proposals
├── adr/                           ← Architecture Decision Records
│   ├── README.md                    formato e processo ADR
│   ├── 0001-modular-monolith.md
│   ├── 0002-multi-tenancy-strategy.md
│   ├── 0003-field-level-auth.md
│   ├── 0004-company-config-first-class.md
│   ├── 0005-cliente-pf-pj-aggregate.md
│   ├── 0006-event-driven-outbox-bullmq.md
│   └── 0007-ai-service-provider-agnostic.md
└── runbooks/                      ← procedimentos operacionais e checklists
    ├── README.md
    ├── pr-checklist.md              o que verificar antes de abrir PR
    └── new-module.md                como criar um novo módulo no estilo da casa
```

## O que NÃO vai aqui

- **Tarefas** → Notion ("✅ Tarefas")
- **Bugs ativos** → Notion ("🐛 Bugs Conhecidos")
- **Resumos de sessão / handoff** → Notion ("💬 Sessões Claude Code")
- **Decisões em formação / propostas** → Notion ("🏛️ Decisões Técnicas")
- **Roadmap fluído** → Notion (página principal "🧠 Orkestree — Cérebro do Projeto")

## O que sempre vai aqui

- **Arquitetura estável** que descreve o sistema como ele *é*
- **ADRs** de decisões já implementadas e validadas
- **Runbooks** operacionais (PR checklist, criação de módulo, troubleshooting de migrations, etc.)

## Antes de mexer

Antes de qualquer mudança, leia:
1. Este `README.md`
2. `docs/architecture/overview.md`
3. ADRs relevantes ao módulo que você vai tocar
4. Notion: tarefas TODO + bugs Alta/Crítica relacionados

## Mantenção

- **Editar um ADR já aceito** = abrir um novo ADR com `Status: Revisada` ou `Revogada` + link cruzado. ADRs são imutáveis depois de `Aceita`.
- **Criar novo ADR** = depois que a decisão estabilizou no Notion. Numerar sequencialmente. Sempre com link de origem na página Notion.
- **Atualizar arquitetura** = quando a realidade do código muda. Não escrever aspiração — escrever o que existe.
