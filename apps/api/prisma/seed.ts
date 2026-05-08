/* eslint-disable no-console */
/**
 * Dev seed — auth foundation + rich operational data for the demo.
 *
 * Two layers:
 *
 *   1. Auth foundation (always runs):
 *      User + 2 Companies + 2 Memberships. Lets a reviewer exercise the full
 *      auth + workspace bootstrap loop end-to-end (POST /auth/login →
 *      GET /memberships/me → tenant-scoped GETs).
 *
 *   2. Studio operational data (rich seed):
 *      One workflow ("Impressão 3D Hospitalar") with 7 stages, 2 service
 *      types, 3 clients (2 PJ + 1 PF), 5 service requests across stages
 *      ranging from initial triagem to final entrega, and 3 proposals in
 *      DRAFT / SENT / APPROVED with realistic line items (~41% margin).
 *
 *      Atelier intentionally stays empty — switching workspace in the UI
 *      should land the operator on a clean dashboard so the workspace-
 *      switch flow is visibly demonstrable.
 *
 * Design rules:
 *   - Idempotent: re-running `prisma db seed` against an existing DB must
 *     not duplicate rows. Every entity has a stable natural key (email,
 *     taxId, code, title) and "find first, create only if missing" pattern.
 *   - No NestJS runtime: this script is invoked by `prisma db seed`, which
 *     does not boot the app. Password-hash formula inlined to mirror
 *     AuthService — `scrypt$<keylen>$<saltHex>$<hashHex>`.
 *   - Direct Prisma writes (no service layer): seed bypasses
 *     advisory-lock numbering and audit emission. That's fine — seed is
 *     single-threaded and the data is for review, not for audit.
 *   - Stable IDs / values: emails, CNPJs, codes are constants so
 *     reviewers and the smoke-test script can hard-code them.
 */

import {
    ClientType,
    MembershipStatus,
    Prisma,
    PrismaClient,
    ProposalStatus,
    Role,
} from '@prisma/client';
import { randomBytes, scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb) as (
    password: string | Buffer,
    salt: string | Buffer,
    keylen: number,
) => Promise<Buffer>;

// Must mirror SCRYPT_PARAMS in apps/api/src/auth/auth.service.ts.
const SCRYPT_KEYLEN = 64;
const SCRYPT_SALT_BYTES = 16;

async function hashPassword(plain: string): Promise<string> {
    const salt = randomBytes(SCRYPT_SALT_BYTES);
    const derived = await scrypt(plain, salt, SCRYPT_KEYLEN);
    return `scrypt$${SCRYPT_KEYLEN}$${salt.toString('hex')}$${derived.toString('hex')}`;
}

// ─── Constants the smoke test depends on ────────────────────────────────────
const DEFAULT_EMAIL = 'owner@orkestree.dev';
const DEFAULT_PASSWORD = 'orkestree-dev-password';

const SEED_USER = {
    email: process.env['SEED_USER_EMAIL'] ?? DEFAULT_EMAIL,
    password: process.env['SEED_USER_PASSWORD'] ?? DEFAULT_PASSWORD,
    firstName: process.env['SEED_USER_FIRST_NAME'] ?? 'Olivia',
    lastName: process.env['SEED_USER_LAST_NAME'] ?? 'Owner',
};

// Production hardening — Sessão 14 (2026-05-08).
//
// Demos e dev rodam com defaults sem cerimônia, mas escrever credenciais
// conhecidamente públicas (este arquivo está no GitHub) num DB de produção
// é um pré-piloto blocker. O incidente da Sessão 14 mostrou o vetor
// concreto: alguém com a URL da API + acesso ao repo público faz login
// como OWNER em segundos.
//
// Checa env vars diretamente (não os valores resolvidos em SEED_USER) para
// que o sinal seja exato: o operador passou credencial explícita ou caiu
// no default? Ambos os casos (env var ausente OU igual ao default público)
// são tratados como "default em uso".
//
// Não cobre o caso "dev rodando localmente apontando pra prod sem
// NODE_ENV=production". Defesa contra esse vetor é disciplina operacional
// + um detector de hostname PaaS no DATABASE_URL — registrado como TASK
// separada no Notion, não bloqueia este PR.
const passwordEnv = process.env['SEED_USER_PASSWORD'];
const emailEnv = process.env['SEED_USER_EMAIL'];
const usingDefaultEmail = !emailEnv || emailEnv === DEFAULT_EMAIL;
const usingDefaultPassword = !passwordEnv || passwordEnv === DEFAULT_PASSWORD;

if (process.env['NODE_ENV'] === 'production') {
    if (usingDefaultEmail || usingDefaultPassword) {
        console.error(
            'Seed abortado: NODE_ENV=production mas credenciais estão no default público.',
        );
        console.error(
            'Defina SEED_USER_EMAIL e SEED_USER_PASSWORD explicitamente antes de rodar este seed contra produção.',
        );
        console.error(
            'Defaults estão em apps/api/prisma/seed.ts (DEFAULT_EMAIL, DEFAULT_PASSWORD) — visíveis no GitHub.',
        );
        process.exit(1);
    }
} else if (usingDefaultPassword) {
    // Dev/test rodando com defaults — log de tripwire pra que seja
    // visível em logs caso o seed esteja apontando pra prod sem que o
    // operador tenha setado NODE_ENV.
    console.warn(
        '⚠ Seed rodando com senha default. Se DATABASE_URL aponta pra prod, aborta agora (Ctrl+C).',
    );
}

const SEED_COMPANIES = [
    {
        legalName: 'Orkestree Studio LTDA',
        tradeName: 'Orkestree Studio',
        taxId: '00000000000001',
        financialEmail: 'finance+studio@orkestree.dev',
        role: Role.OWNER,
    },
    {
        legalName: 'Orkestree Atelier LTDA',
        tradeName: 'Orkestree Atelier',
        taxId: '00000000000002',
        financialEmail: 'finance+atelier@orkestree.dev',
        role: Role.FINANCEIRO,
    },
] as const;

const PLACEHOLDER_ADDRESS = {
    addressStreet: 'Rua de Teste',
    addressNumber: '100',
    addressNeighborhood: 'Centro',
    addressCity: 'São Paulo',
    addressState: 'SP',
    addressPostalCode: '01000-000',
    addressCountry: 'BR',
} as const;

// ─── Studio rich seed — vertical 3D hospitalar ──────────────────────────────

const WORKFLOW_3D_HOSPITALAR = {
    code: 'impressao_3d_hospitalar',
    name: 'Impressão 3D Hospitalar',
    description:
        'Workflow padrão para empresas de impressão 3D atendendo clientes de saúde — triagem do pedido até entrega validada com QA.',
} as const;

// 7 stages — ordem operacional canônica do vertical.
const WORKFLOW_STAGES = [
    { code: 'triagem', name: 'Triagem', sortOrder: 0, isInitial: true, isFinal: false, color: '#94a3b8' },
    { code: 'modelagem', name: 'Modelagem', sortOrder: 1, isInitial: false, isFinal: false, color: '#60a5fa' },
    { code: 'impressao', name: 'Impressão', sortOrder: 2, isInitial: false, isFinal: false, color: '#818cf8' },
    { code: 'cura_uv', name: 'Cura UV', sortOrder: 3, isInitial: false, isFinal: false, color: '#a78bfa' },
    { code: 'pos_processamento', name: 'Pós-processamento', sortOrder: 4, isInitial: false, isFinal: false, color: '#c084fc' },
    { code: 'qa', name: 'QA', sortOrder: 5, isInitial: false, isFinal: false, color: '#f59e0b' },
    { code: 'entrega', name: 'Entrega', sortOrder: 6, isInitial: false, isFinal: true, color: '#10b981' },
] as const;

// Forward-only operational pipeline. Backward transitions (e.g., "QA failed →
// Modelagem") are deferred until product feedback shows demand — adding them
// later is additive (one extra row per declared edge), no schema change.
// requiresApproval is false on every edge in V1; flip per-edge later if a
// quality gate (likely qa → entrega) wants to require REQUEST.APPROVE.
const WORKFLOW_TRANSITIONS: ReadonlyArray<{ from: string; to: string; requiresApproval: boolean }> = [
    { from: 'triagem', to: 'modelagem', requiresApproval: false },
    { from: 'modelagem', to: 'impressao', requiresApproval: false },
    { from: 'impressao', to: 'cura_uv', requiresApproval: false },
    { from: 'cura_uv', to: 'pos_processamento', requiresApproval: false },
    { from: 'pos_processamento', to: 'qa', requiresApproval: false },
    { from: 'qa', to: 'entrega', requiresApproval: false },
];

const SERVICE_TYPES = [
    { code: 'protese_dentaria_3d', name: 'Prótese dentária 3D', description: 'Próteses dentárias customizadas impressas em resina biocompatível.' },
    { code: 'peca_cirurgica', name: 'Peça cirúrgica customizada', description: 'Modelos anatômicos, guias cirúrgicos e peças específicas para procedimentos médicos.' },
] as const;

// Clients — chaveados por taxId (PJ) ou name (PF, sem taxId obrigatório).
const SEED_CLIENTS = [
    {
        kind: 'BUSINESS' as const,
        legalName: 'Hospital São Paulo Serviços Médicos LTDA',
        tradeName: 'Hospital São Paulo',
        taxId: '60884800000131',
        email: 'compras@hsaopaulo.example.br',
        phone: '+55 11 3838-1000',
        addressCity: 'São Paulo',
        addressState: 'SP',
    },
    {
        kind: 'BUSINESS' as const,
        legalName: 'Clínica Odontológica Sorriso LTDA',
        tradeName: 'Clínica Sorriso',
        taxId: '27194080000196',
        email: 'contato@clinicasorriso.example.br',
        phone: '+55 11 4002-8922',
        addressCity: 'Campinas',
        addressState: 'SP',
    },
    {
        kind: 'INDIVIDUAL' as const,
        name: 'Dr. Carlos Mendes',
        taxId: '12345678901',
        email: 'dr.carlos.mendes@example.br',
        phone: '+55 11 91234-5678',
        addressCity: 'São Paulo',
        addressState: 'SP',
    },
] as const;

// Type for the seeded request specs.
interface RequestSpec {
    title: string;
    description: string;
    serviceTypeCode: 'protese_dentaria_3d' | 'peca_cirurgica';
    clientTaxIdOrName: string; // BUSINESS uses taxId, INDIVIDUAL uses name
    currentStageCode: typeof WORKFLOW_STAGES[number]['code'];
}

// 5 requests — 2 NEW (triagem), 1 IN_PROGRESS (impressao), 1 IN_PROGRESS (qa),
// 1 COMPLETED (entrega).
const SEED_REQUESTS: readonly RequestSpec[] = [
    {
        title: 'Prótese mandibular customizada — paciente A',
        description: 'Prótese reconstrutiva pós-trauma. Tomografia anexa ao pedido.',
        serviceTypeCode: 'peca_cirurgica',
        clientTaxIdOrName: '60884800000131',
        currentStageCode: 'triagem',
    },
    {
        title: 'Guia cirúrgico para implante dentário',
        description: 'Guia de perfuração customizado para 3 implantes superiores.',
        serviceTypeCode: 'peca_cirurgica',
        clientTaxIdOrName: '27194080000196',
        currentStageCode: 'triagem',
    },
    {
        title: 'Prótese dentária superior 3D — Dr. Carlos',
        description: 'Prótese total maxilar em resina biocompatível com cura UV.',
        serviceTypeCode: 'protese_dentaria_3d',
        clientTaxIdOrName: 'Dr. Carlos Mendes',
        currentStageCode: 'impressao',
    },
    {
        title: 'Modelo anatômico maxilofacial',
        description: 'Modelo pré-cirúrgico para planejamento de ressecção tumoral.',
        serviceTypeCode: 'peca_cirurgica',
        clientTaxIdOrName: '60884800000131',
        currentStageCode: 'qa',
    },
    {
        title: 'Aligner dental personalizado',
        description: 'Conjunto de aligners (8 estágios) impressos individualmente.',
        serviceTypeCode: 'protese_dentaria_3d',
        clientTaxIdOrName: '27194080000196',
        currentStageCode: 'entrega',
    },
] as const;

// Items shape: subtotal computed by helper. internalCost dimensioned for ~41% margin.
interface ItemSpec {
    description: string;
    unit: string;
    quantity: string; // Decimal as string for precision
    unitPrice: string;
    internalCost: string;
}

interface ProposalSpec {
    title: string;
    notes: string;
    clientNotes: string;
    status: 'DRAFT' | 'SENT' | 'APPROVED';
    requestTitle: string; // natural key into the requests above
    items: ItemSpec[];
}

const SEED_PROPOSALS: readonly ProposalSpec[] = [
    {
        title: 'Orçamento — Prótese mandibular paciente A',
        notes: 'Confirmar com radiologia o lote de tomografia antes de fechar.',
        clientNotes: 'Validade da proposta: 30 dias. Inclui revisão pré-impressão.',
        status: 'DRAFT',
        requestTitle: 'Prótese mandibular customizada — paciente A',
        items: [
            { description: 'Resina biocompatível tipo X', unit: 'ml', quantity: '50', unitPrice: '280.00', internalCost: '165.00' },
            { description: 'Hora de impressora 3D', unit: 'h', quantity: '4', unitPrice: '350.00', internalCost: '200.00' },
            { description: 'Mão de obra técnica', unit: 'h', quantity: '6', unitPrice: '180.00', internalCost: '110.00' },
        ],
    },
    {
        title: 'Orçamento — Guia cirúrgico implante dentário',
        notes: 'Cliente recorrente; condições padrão de pagamento.',
        clientNotes: 'Entrega prevista em 7 dias úteis após aprovação.',
        status: 'SENT',
        requestTitle: 'Guia cirúrgico para implante dentário',
        items: [
            { description: 'Resina biocompatível tipo X', unit: 'ml', quantity: '30', unitPrice: '280.00', internalCost: '165.00' },
            { description: 'Hora de impressora 3D', unit: 'h', quantity: '2.5', unitPrice: '350.00', internalCost: '200.00' },
            { description: 'Mão de obra técnica', unit: 'h', quantity: '4', unitPrice: '180.00', internalCost: '110.00' },
        ],
    },
    {
        title: 'Orçamento — Prótese dentária superior 3D',
        notes: 'Aprovado em 2026-04-28. Iniciar impressão imediatamente.',
        clientNotes: 'Pagamento em duas parcelas conforme acordado por e-mail.',
        status: 'APPROVED',
        requestTitle: 'Prótese dentária superior 3D — Dr. Carlos',
        items: [
            { description: 'Resina biocompatível tipo X', unit: 'ml', quantity: '80', unitPrice: '280.00', internalCost: '165.00' },
            { description: 'Hora de impressora 3D', unit: 'h', quantity: '6', unitPrice: '350.00', internalCost: '200.00' },
            { description: 'Mão de obra técnica', unit: 'h', quantity: '8', unitPrice: '180.00', internalCost: '110.00' },
        ],
    },
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function decimal(s: string): Prisma.Decimal {
    return new Prisma.Decimal(s);
}

/**
 * Compute item subtotal = quantity × unitPrice (no per-item discount in seed).
 * Mirrors ProposalItemsService.recompute logic for the no-discount branch.
 */
function itemSubtotal(item: ItemSpec): Prisma.Decimal {
    return decimal(item.quantity).mul(decimal(item.unitPrice));
}

/**
 * Compute proposal totals from items (no proposal-level discount in seed).
 * Returns { subtotal, totalPrice, totalCost } as Prisma.Decimal.
 */
function computeProposalTotals(items: readonly ItemSpec[]) {
    const subtotal = items.reduce(
        (acc, it) => acc.plus(itemSubtotal(it)),
        decimal('0'),
    );
    const totalCost = items.reduce(
        (acc, it) => acc.plus(decimal(it.quantity).mul(decimal(it.internalCost))),
        decimal('0'),
    );
    return { subtotal, totalPrice: subtotal, totalCost };
}

/** Sequential per-company number for entities that have one (Client, Request, Proposal). */
async function nextNumber(
    prisma: PrismaClient,
    model: 'client' | 'serviceRequest' | 'proposal',
    companyId: string,
): Promise<number> {
    const agg = await prisma[model].aggregate({
        where: { companyId },
        _max: { number: true },
    });
    return (agg._max.number ?? 0) + 1;
}

// ─── Studio rich seed ───────────────────────────────────────────────────────

async function seedStudioOperationalData(
    prisma: PrismaClient,
    companyId: string,
    actorMembershipId: string,
): Promise<void> {
    // 1. Workflow — upsert by (companyId, code), claim sole default.
    //    Partial unique index allows only one isDefault=true per company,
    //    so before promoting our seed workflow, demote any other default
    //    that survived from prior smoke tests or manual UI work.
    await prisma.workflow.updateMany({
        where: {
            companyId,
            isDefault: true,
            code: { not: WORKFLOW_3D_HOSPITALAR.code },
        },
        data: { isDefault: false },
    });
    const workflow = await prisma.workflow.upsert({
        where: { companyId_code: { companyId, code: WORKFLOW_3D_HOSPITALAR.code } },
        update: {
            name: WORKFLOW_3D_HOSPITALAR.name,
            description: WORKFLOW_3D_HOSPITALAR.description,
            isDefault: true,
            isActive: true,
        },
        create: {
            companyId,
            code: WORKFLOW_3D_HOSPITALAR.code,
            name: WORKFLOW_3D_HOSPITALAR.name,
            description: WORKFLOW_3D_HOSPITALAR.description,
            isDefault: true,
            isActive: true,
        },
    });
    console.log(`✓ workflow    ${workflow.name.padEnd(28)}  (id=${workflow.id})`);

    // 2. Stages — find by (workflowId, code), create if missing. Index by code.
    const stagesByCode = new Map<string, { id: string; code: string; sortOrder: number }>();
    for (const s of WORKFLOW_STAGES) {
        let stage = await prisma.workflowStage.findUnique({
            where: { workflowId_code: { workflowId: workflow.id, code: s.code } },
        });
        if (!stage) {
            stage = await prisma.workflowStage.create({
                data: {
                    companyId,
                    workflowId: workflow.id,
                    code: s.code,
                    name: s.name,
                    sortOrder: s.sortOrder,
                    isInitial: s.isInitial,
                    isFinal: s.isFinal,
                    color: s.color,
                    isActive: true,
                },
            });
        }
        stagesByCode.set(s.code, stage);
    }
    console.log(`✓ stages      ${WORKFLOW_STAGES.length} stages (triagem → entrega)`);

    // 2b. Stage transitions — declare the legal edges of the workflow's state
    //     machine. Idempotent: lookup by (workflowId, fromStageId, toStageId)
    //     before insert so re-seeding an existing DB doesn't duplicate or
    //     fail on the @@unique. Without this, /requests/:id/available-
    //     transitions returns [] for every request and the UI's TransitionMenu
    //     stays hidden.
    for (const t of WORKFLOW_TRANSITIONS) {
        const fromStage = stagesByCode.get(t.from);
        const toStage = stagesByCode.get(t.to);
        if (!fromStage || !toStage) {
            throw new Error(
                `Seed: cannot declare transition ${t.from} → ${t.to}: stage(s) missing.`,
            );
        }
        const existing = await prisma.stageTransition.findFirst({
            where: {
                workflowId: workflow.id,
                fromStageId: fromStage.id,
                toStageId: toStage.id,
            },
            select: { id: true },
        });
        if (!existing) {
            await prisma.stageTransition.create({
                data: {
                    companyId,
                    workflowId: workflow.id,
                    fromStageId: fromStage.id,
                    toStageId: toStage.id,
                    requiresApproval: t.requiresApproval,
                },
            });
        }
    }
    console.log(`✓ transitions ${WORKFLOW_TRANSITIONS.length} forward edges`);

    // 3. Service types — find by (companyId, code).
    const serviceTypesByCode = new Map<string, { id: string }>();
    for (const st of SERVICE_TYPES) {
        let serviceType = await prisma.serviceType.findUnique({
            where: { companyId_code: { companyId, code: st.code } },
        });
        if (!serviceType) {
            serviceType = await prisma.serviceType.create({
                data: {
                    companyId,
                    code: st.code,
                    name: st.name,
                    description: st.description,
                    workflowId: workflow.id,
                    isActive: true,
                    sortOrder: 0,
                },
            });
        }
        serviceTypesByCode.set(st.code, serviceType);
    }
    console.log(`✓ serviceTypes ${SERVICE_TYPES.length} types`);

    // 4. Clients — find by taxId (PJ) or name (PF, since taxId is optional in seed PF).
    const clientsByKey = new Map<string, { id: string; name: string }>();
    for (const c of SEED_CLIENTS) {
        const lookupKey = c.kind === 'BUSINESS' ? c.taxId : c.name;
        // taxId is unique per company (raw SQL partial unique). For lookup by
        // (companyId, taxId), use findFirst since the unique is partial.
        const existing = await prisma.client.findFirst({
            where:
                c.kind === 'BUSINESS'
                    ? { companyId, taxId: c.taxId }
                    : { companyId, type: 'INDIVIDUAL', name: c.name },
            select: { id: true, name: true },
        });
        if (existing) {
            clientsByKey.set(lookupKey, existing);
            continue;
        }

        const number = await nextNumber(prisma, 'client', companyId);
        const created = await prisma.client.create({
            data: {
                companyId,
                number,
                type: c.kind === 'BUSINESS' ? ClientType.BUSINESS : ClientType.INDIVIDUAL,
                name: c.kind === 'BUSINESS' ? (c.tradeName ?? c.legalName) : c.name,
                email: c.email,
                phone: c.phone,
                taxId: c.taxId,
                isActive: true,
                ...(c.kind === 'BUSINESS'
                    ? {
                          legalName: c.legalName,
                          tradeName: c.tradeName,
                      }
                    : {}),
                addressCity: c.addressCity,
                addressState: c.addressState,
                addressCountry: 'BR',
            },
            select: { id: true, name: true },
        });
        clientsByKey.set(lookupKey, created);
    }
    console.log(`✓ clients     ${SEED_CLIENTS.length} clientes (2 PJ + 1 PF)`);

    // 5. Service requests — find by (companyId, title) — title is the natural
    //    key for seed (not unique by schema, but seed titles are deliberately
    //    distinctive). Each request also gets its history trail synthesised.
    const requestsByTitle = new Map<string, { id: string }>();
    for (const r of SEED_REQUESTS) {
        const existing = await prisma.serviceRequest.findFirst({
            where: { companyId, title: r.title },
            select: { id: true },
        });
        if (existing) {
            requestsByTitle.set(r.title, existing);
            continue;
        }

        const serviceType = serviceTypesByCode.get(r.serviceTypeCode)!;
        const targetStage = stagesByCode.get(r.currentStageCode)!;
        // Resolve client: BUSINESS lookup by taxId, INDIVIDUAL by name.
        const client = clientsByKey.get(r.clientTaxIdOrName);
        if (!client) {
            throw new Error(`Seed: client lookup failed for "${r.clientTaxIdOrName}"`);
        }

        const number = await nextNumber(prisma, 'serviceRequest', companyId);

        const request = await prisma.serviceRequest.create({
            data: {
                companyId,
                number,
                serviceTypeId: serviceType.id,
                workflowId: workflow.id,
                currentStageId: targetStage.id,
                clientId: client.id,
                title: r.title,
                description: r.description,
                createdByMembershipId: actorMembershipId,
            },
            select: { id: true, currentStageId: true },
        });

        // Synthesise stage history: from the initial stage up to current,
        // one transition row per stage so the history view in the UI shows
        // a coherent trail. fromStageId = null on the very first row
        // (initial placement), then each subsequent row points back at the
        // previous stage.
        const trailUntil = WORKFLOW_STAGES.findIndex((s) => s.code === r.currentStageCode);
        let prevStageId: string | null = null;
        for (let i = 0; i <= trailUntil; i++) {
            const stage = stagesByCode.get(WORKFLOW_STAGES[i]!.code)!;
            await prisma.requestStageHistory.create({
                data: {
                    companyId,
                    requestId: request.id,
                    fromStageId: prevStageId,
                    toStageId: stage.id,
                    actorMembershipId,
                },
            });
            prevStageId = stage.id;
        }

        requestsByTitle.set(r.title, { id: request.id });
    }
    console.log(`✓ requests    ${SEED_REQUESTS.length} pedidos (2 triagem, 1 impressão, 1 QA, 1 entrega)`);

    // 6. Proposals — find by (companyId, title). Items + status history are
    //    the mutable child collections; we only create them when the
    //    proposal itself is missing (idempotent: never reset items on a
    //    proposal that already exists, since real users may have edited).
    let proposalsCreated = 0;
    let proposalsSkipped = 0;
    for (const p of SEED_PROPOSALS) {
        const existing = await prisma.proposal.findFirst({
            where: { companyId, title: p.title },
            select: { id: true, status: true },
        });
        if (existing) {
            proposalsSkipped++;
            continue;
        }

        const request = requestsByTitle.get(p.requestTitle);
        if (!request) {
            throw new Error(`Seed: request lookup failed for proposal "${p.title}"`);
        }
        const requestRow = await prisma.serviceRequest.findUnique({
            where: { id: request.id },
            select: { clientId: true },
        });

        const totals = computeProposalTotals(p.items);
        const number = await nextNumber(prisma, 'proposal', companyId);
        const status = ProposalStatus[p.status];
        const now = new Date();
        // Past timestamps for SENT / APPROVED so the data feels lived-in.
        const sentAt = p.status === 'SENT' || p.status === 'APPROVED'
            ? new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
            : null;
        const approvedAt = p.status === 'APPROVED'
            ? new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000)
            : null;

        const proposal = await prisma.proposal.create({
            data: {
                companyId,
                serviceRequestId: request.id,
                clientId: requestRow?.clientId ?? null,
                number,
                status,
                title: p.title,
                notes: p.notes,
                clientNotes: p.clientNotes,
                subtotal: totals.subtotal,
                totalPrice: totals.totalPrice,
                totalCost: totals.totalCost,
                sentAt,
                approvedAt,
                approvedByMembershipId: p.status === 'APPROVED' ? actorMembershipId : null,
                createdByMembershipId: actorMembershipId,
                items: {
                    create: p.items.map((it, idx) => ({
                        companyId,
                        description: it.description,
                        unit: it.unit,
                        quantity: decimal(it.quantity),
                        unitPrice: decimal(it.unitPrice),
                        internalCost: decimal(it.internalCost),
                        subtotal: itemSubtotal(it),
                        sortOrder: idx,
                    })),
                },
            },
            select: { id: true },
        });

        // Status history — null → DRAFT always; plus DRAFT → SENT for SENT
        // and APPROVED; plus SENT → APPROVED for APPROVED.
        await prisma.proposalStatusHistory.create({
            data: {
                companyId,
                proposalId: proposal.id,
                fromStatus: null,
                toStatus: ProposalStatus.DRAFT,
                actorMembershipId,
            },
        });
        if (status === ProposalStatus.SENT || status === ProposalStatus.APPROVED) {
            await prisma.proposalStatusHistory.create({
                data: {
                    companyId,
                    proposalId: proposal.id,
                    fromStatus: ProposalStatus.DRAFT,
                    toStatus: ProposalStatus.SENT,
                    actorMembershipId,
                    createdAt: sentAt!,
                },
            });
        }
        if (status === ProposalStatus.APPROVED) {
            await prisma.proposalStatusHistory.create({
                data: {
                    companyId,
                    proposalId: proposal.id,
                    fromStatus: ProposalStatus.SENT,
                    toStatus: ProposalStatus.APPROVED,
                    actorMembershipId,
                    note: 'Aprovado pelo cliente.',
                    createdAt: approvedAt!,
                },
            });
        }
        proposalsCreated++;
    }
    console.log(
        `✓ proposals   ${proposalsCreated} criadas, ${proposalsSkipped} já existiam (DRAFT, SENT, APPROVED)`,
    );
}

async function main(): Promise<void> {
    const prisma = new PrismaClient();
    try {
        const passwordHash = await hashPassword(SEED_USER.password);

        // ── 1. User ─────────────────────────────────────────────────────────
        const user = await prisma.user.upsert({
            where: { email: SEED_USER.email },
            update: {
                firstName: SEED_USER.firstName,
                lastName: SEED_USER.lastName,
                isActive: true,
            },
            create: {
                email: SEED_USER.email,
                passwordHash,
                firstName: SEED_USER.firstName,
                lastName: SEED_USER.lastName,
                isActive: true,
            },
            select: { id: true, email: true, passwordHash: true },
        });

        if (!user.passwordHash.startsWith('scrypt$')) {
            await prisma.user.update({
                where: { id: user.id },
                data: { passwordHash },
            });
            console.log(`  · re-hashed legacy password for ${user.email}`);
        }
        console.log(`✓ user        ${user.email}  (id=${user.id})`);

        // ── 2. Companies + Memberships ──────────────────────────────────────
        const companyMemberships = new Map<string, { companyId: string; membershipId: string }>();
        for (const c of SEED_COMPANIES) {
            const company = await prisma.company.upsert({
                where: { taxId: c.taxId },
                update: {
                    legalName: c.legalName,
                    tradeName: c.tradeName,
                    isActive: true,
                },
                create: {
                    legalName: c.legalName,
                    tradeName: c.tradeName,
                    taxId: c.taxId,
                    financialEmail: c.financialEmail,
                    isActive: true,
                    ...PLACEHOLDER_ADDRESS,
                },
                select: { id: true, legalName: true, taxId: true, tradeName: true },
            });

            const membership = await prisma.companyMembership.upsert({
                where: {
                    companyId_userId: {
                        companyId: company.id,
                        userId: user.id,
                    },
                },
                update: {
                    role: c.role,
                    status: MembershipStatus.ACTIVE,
                },
                create: {
                    companyId: company.id,
                    userId: user.id,
                    role: c.role,
                    status: MembershipStatus.ACTIVE,
                },
                select: { id: true, role: true },
            });

            companyMemberships.set(c.tradeName, {
                companyId: company.id,
                membershipId: membership.id,
            });

            console.log(
                `✓ company     ${company.legalName.padEnd(28)}  ` +
                    `(id=${company.id})  role=${membership.role}`,
            );
        }

        // ── 3. Studio rich operational data ─────────────────────────────────
        const studio = companyMemberships.get('Orkestree Studio');
        if (!studio) {
            throw new Error('Seed: Orkestree Studio not found after upsert.');
        }
        console.log('');
        console.log('Seeding Studio operational data (3D hospitalar vertical)…');
        await seedStudioOperationalData(prisma, studio.companyId, studio.membershipId);

        // ── 4. Final summary ────────────────────────────────────────────────
        console.log('');
        console.log('Seed complete. Sign in with:');
        console.log(`  email    : ${SEED_USER.email}`);
        console.log(`  password : ${SEED_USER.password}`);
        console.log('');
        console.log(
            'Studio (OWNER) tem dados ricos pra demo. Atelier (FINANCEIRO) ' +
                'fica vazio pra demonstrar workspace switching.',
        );
    } finally {
        await prisma.$disconnect();
    }
}

main().catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
});
