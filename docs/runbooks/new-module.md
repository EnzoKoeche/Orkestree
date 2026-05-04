# Criar um novo módulo

Guia para criar um módulo novo no `apps/api/src/<module>/` seguindo o estilo já estabelecido por `service-requests`, `clients`, `company-config`, e `proposals`.

## Antes de começar

1. Ler `docs/architecture/overview.md`.
2. Ler ADRs relevantes (especialmente [0002 multi-tenancy](../adr/0002-multi-tenancy-strategy.md), [0003 field-level auth](../adr/0003-field-level-auth.md), [0004 company-config](../adr/0004-company-config-first-class.md)).
3. Olhar um módulo análogo já estável e copiar a estrutura.

## Estrutura

```
apps/api/src/<module>/
├── <module>.module.ts            ← imports + providers + exports
├── <module>.controller.ts        ← rotas REST com guards
├── <module>.service.ts           ← CRUD principal
├── <module>-<aspect>.service.ts  ← serviços especializados (ex.: -transitions, -items, -field-values)
└── dto/
    ├── create-<module>.dto.ts
    ├── update-<module>.dto.ts
    ├── list-<module>.dto.ts
    └── <action>-<module>.dto.ts  ← ex.: transition, cancel, assign
```

## Schema Prisma

1. Adicionar models em `apps/api/prisma/schema.prisma`.
2. Toda tabela de domínio tem **`companyId`** + composite indexes onde fizer sentido (`@@index([companyId, ...])`).
3. FKs cross-domain compostas em `(companyId, id)` — declaradas em `Raw SQL:` comments e materializadas em migration.
4. Numerar entidades operacionais com `number Int` + `@@unique([companyId, number])`.
5. `prisma migrate dev --name <nome-curto>`. Conferir migration gerada antes de commitar.

## Module file

```ts
import { Module } from '@nestjs/common';
import { ConfigAuditModule } from '../company-config/audit/config-audit.module';
import { MyController } from './my.controller';
import { MyService } from './my.service';
// importar serviços especializados

@Module({
  imports: [ConfigAuditModule],
  controllers: [MyController],
  providers: [MyService /*, ...specializadoServices */],
  exports: [MyService],
})
export class MyModule { }
```

Registrar em `apps/api/src/app.module.ts`.

## Controller

```ts
@UseGuards(JwtAuthGuard, CompanyMemberGuard, ResourcePermissionGuard)
@Controller('companies/:companyId/<resource>')
export class MyController {
  constructor(private readonly service: MyService) { }

  @RequirePermission(CompanyResource.MY_RESOURCE, PermissionAction.VIEW)
  @Get()
  list(
    @CurrentMembership() membership: Pick<CompanyMembership, 'id' | 'companyId' | 'userId' | 'role'>,
    @Query() query: ListMyDto,
  ) {
    return this.service.list(membership, query);
  }
  // …
}
```

- Sempre `companies/:companyId/<resource>` na rota.
- Sempre os 3 guards na ordem: `JwtAuthGuard` → `CompanyMemberGuard` → `ResourcePermissionGuard`.
- Cada handler tem `@RequirePermission(resource, action)`.

## Service

```ts
@Injectable()
export class MyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: ConfigAuditService,
    private readonly events: EventEmitter2,
  ) { }

  async create(membership: CompanyMembership, dto: CreateMyDto) {
    let createdId: string | null = null;

    await this.prisma.$transaction(async (tx) => {
      // 1. Validações que tocam outras tabelas
      // 2. (se aplicável) advisory lock pra numbering
      // 3. tx.<entity>.create({ data: { companyId, ... }, select: { id: true } })
      // 4. Audit dentro da tx
      await this.auditService.write(tx, { … });
      createdId = created.id;
    });

    if (createdId) {
      this.events.emit('<resource>.created', { companyId: membership.companyId, id: createdId });
    }

    return this.get(membership, createdId!);
  }
  // …
}
```

**Regras:**

- `companyId` vem da membership, não do DTO.
- Audit dentro da tx; eventos depois.
- Selects explícitos via `satisfies Prisma.<Entity>Select`.
- Se o módulo tem campo sensível: três selects (`*_PRIVILEGED` / `*_STANDARD` / `*_CLIENT`) + `selectForRole(role)`. Ver [`../architecture/field-level-auth.md`](../architecture/field-level-auth.md) e [ADR-0003](../adr/0003-field-level-auth.md).

## DTOs

```ts
import { IsString, MinLength, MaxLength, IsOptional } from 'class-validator';

export class CreateMyDto {
  @IsString() @MinLength(1) @MaxLength(256)
  name: string;

  @IsOptional() @IsString() @MaxLength(4096)
  description?: string;
}
```

`ValidationPipe` global (em `main.ts`) já está com `whitelist + forbidNonWhitelisted + transform`. Não duplicar `@Type()` se não for necessário.

## Permissions

1. Adicionar valor ao enum `CompanyResource` no schema Prisma se for um recurso novo.
2. Adicionar defaults em `apps/api/src/company-config/permissions/permission.defaults.ts` (`SYSTEM_DEFAULTS`).
3. Se houver campo sensível: registry em `sensitive-field.registry.ts` + `FIELD_DEFAULTS`.

## Lifecycle / state machine

Para módulos com estados (ex.: proposals com DRAFT/SENT/...):

- Service especializado `<module>-transitions.service.ts`.
- Endpoint único `POST /:id/transition` com DTO contendo `toStatus`.
- `SELECT … FOR UPDATE` no início da transação.
- Tabela de transições permitidas em constante (`ALLOWED_TRANSITIONS`).
- Permissões extras (APPROVE/REJECT) checadas via `PermissionResolverService.isAllowed`.
- Status history append-only (`<Module>StatusHistory`).
- Audit `AuditOperation.TRANSITION`.

## Antes de commitar

Passar pelo [`pr-checklist.md`](./pr-checklist.md).
