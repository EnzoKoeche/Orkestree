# Field-level authorization

> Decisão original: [ADR-0003](../adr/0003-field-level-auth.md). Implementação tem dois mecanismos complementares.

Custo interno, margem, dados financeiros sensíveis precisam ser invisíveis para roles não autorizadas. Frontend nunca esconde isso — backend é a única autoridade.

## Roles e RoleCategory

| Role | Categoria | Acesso |
|---|---|---|
| `OWNER` | `PRIVILEGED` | Tudo, incluindo custo interno e margem |
| `ADMIN` | `PRIVILEGED` | Tudo, incluindo custo interno e margem |
| `FINANCEIRO` | `FINANCIAL` | Valor final, pagamentos, recebíveis. Sem custo interno por padrão |
| `OPERACIONAL` | `OPERATIONAL` | Dados operacionais (workflow, request, etc). Sem dados financeiros sensíveis |
| `CLIENTE` | `CLIENT` | Apenas dados externamente publicados. Row-filtered |

`RoleCategory` está em `apps/api/src/company-config/permissions/permission.defaults.ts` junto com `SYSTEM_DEFAULTS` e `FIELD_DEFAULTS`.

## Os dois mecanismos

### Mecanismo A — selects role-aware no service

Cada service que retorna dados sensíveis define **dois selects Prisma**:

```ts
const PROPOSAL_INTERNAL_SELECT = {
  id: true, ..., totalCost: true, notes: true, ...
} satisfies Prisma.ProposalSelect;

const PROPOSAL_CLIENT_SELECT = {
  id: true, ..., // sem totalCost, sem notes interno
} satisfies Prisma.ProposalSelect;

function selectForRole(role: Role): Prisma.ProposalSelect {
  return role === Role.OWNER || role === Role.ADMIN
    ? PROPOSAL_INTERNAL_SELECT
    : PROPOSAL_CLIENT_SELECT;
}
```

Vantagem: campo sensível **nunca é fetchado** pra quem não tem acesso. É a defesa primária.

### Mecanismo B — `FieldFilterInterceptor` global

Registrado em `main.ts` como interceptor global. Lê todo objeto que sai da API e tira campos listados no `SENSITIVE_FIELD_REGISTRY` se a role do request não tem `canSeeField`.

```ts
// apps/api/src/company-config/permissions/sensitive-field.registry.ts
export const SENSITIVE_FIELD_REGISTRY = {
  internalCost: SensitiveField.INTERNAL_COST,
  totalCost: SensitiveField.INTERNAL_COST,
  margin: SensitiveField.MARGIN,
  ...
};
```

Vantagem: defense-in-depth. Se algum service esquecer o select role-aware (Mecanismo A), o interceptor ainda tira o campo antes de sair na resposta.

**Não substitui o Mecanismo A** — sem o A, o dado vaza para logs, traces e qualquer cache de objeto antes do interceptor agir.

## Permissões resolvidas (canSeeField, isAllowed)

`PermissionResolverService` resolve em três camadas:

1. **UserPermissionOverride** (mais específico)
2. **RolePermission** definido pela company
3. **Hardcoded defaults** em `permission.defaults.ts`

Cache em Redis com TTL de 5 minutos. Invalidação via `invalidateForMembership` / `invalidateForCompany` quando overrides mudam.

`CompanyMembership.isActive` **nunca é cacheado** — sempre lido do DB no `CompanyMemberGuard`.

## Adicionar um campo sensível

1. Adicionar a coluna no schema Prisma (`schema.prisma`).
2. Mapear no `SENSITIVE_FIELD_REGISTRY` para um valor de `SensitiveField`.
3. Adicionar ao `INTERNAL_SELECT` do service relevante (e **não** ao `CLIENT_SELECT`).
4. Conferir `FIELD_DEFAULTS` — geralmente só `OWNER`/`ADMIN` por default.
5. Confirmar que PDFs e endpoints de portal CLIENTE usam o select correto.

## PDFs

PDFs gerados para `CLIENTE` usam **exclusivamente** `PROPOSAL_CLIENT_SELECT`. Nunca expõem `totalCost`, `internalCost`, `notes` interno, ou margens. O pipeline de PDF não tem caminho para reaproveitar dados de admin.

## Frontend

Frontend pode usar `canSeeField` retornado em endpoints de session pra esconder UI. Mas **a API não confia** que o frontend escondeu — o backend filtra antes de mandar. Esconder no frontend é UX, não segurança.
