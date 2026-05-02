import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Prisma } from '@prisma/client';

// ─────────────────────────────────────────────────────────────────────────────
// proposal-pdf.renderer.ts
//
// Server-side HTML → PDF rendering for proposals. Two responsibilities:
//
//   1. buildClientFacingHtml(snapshot)
//      Produces a deterministic, client-safe HTML document from a
//      pre-loaded snapshot object. The snapshot is the single source of
//      truth — the renderer NEVER queries the database and NEVER touches
//      the network. This makes the render pure, easy to unit-test, and
//      impossible to accidentally leak privileged fields (the snapshot
//      type does not even carry internalCost / totalCost).
//
//   2. renderToPdf(html)
//      Drives Puppeteer (loaded lazily) and returns the PDF bytes.
//      Puppeteer is launched with a hardened sandbox profile and a
//      single shared browser instance per process — proposal renders are
//      bursty around APPROVED transitions and a one-browser-per-render
//      cost model burns ~500ms each time.
//
// Sensitive-field discipline:
//   - The renderer ONLY accepts fields present on ProposalPdfSnapshot.
//   - internalCost and totalCost are intentionally absent from the
//     snapshot type. They cannot be passed in, cannot be rendered,
//     cannot leak. This is Mechanism A for the PDF surface.
//   - Currency formatting uses backend-computed totals (subtotal,
//     totalPrice, item.subtotal). Client-supplied numbers never reach
//     the document.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The exact, narrow shape the renderer accepts. Constructed by
 * ProposalPdfService from explicit Prisma selects — no `internalCost`,
 * no `totalCost`, no `notes` (notes is internal-only).
 *
 * Decimal fields are passed as `Prisma.Decimal` to keep formatting under
 * the renderer's control (consistent rounding, no `.toString()` surprises
 * across Decimal/string/number drift).
 */
export type ProposalPdfSnapshot = {
    proposal: {
        id: string;
        number: number;
        title: string;
        status: 'APPROVED'; // narrowed: renderer only runs for APPROVED
        clientNotes: string | null;
        discountPct: Prisma.Decimal | null;
        discountAmount: Prisma.Decimal | null;
        subtotal: Prisma.Decimal;
        totalPrice: Prisma.Decimal;
        validUntil: Date | null;
        approvedAt: Date;
        createdAt: Date;
    };
    company: {
        legalName: string;
        tradeName: string | null;
        taxId: string;
        addressLine: string;
    };
    serviceRequest: {
        number: number;
        title: string;
    };
    client: {
        name: string;
        taxId: string | null;
        email: string | null;
        phone: string | null;
    } | null;
    items: ReadonlyArray<{
        description: string;
        unit: string | null;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        discountPct: Prisma.Decimal | null;
        subtotal: Prisma.Decimal;
        sortOrder: number;
    }>;
};

@Injectable()
export class ProposalPdfRenderer implements OnModuleDestroy {
    private readonly logger = new Logger(ProposalPdfRenderer.name);

    // Lazy-initialised, process-wide Puppeteer browser. We do NOT keep
    // multiple browsers alive; concurrent renders share this one and
    // each gets its own page. A page is cheap (~30ms); a browser is not
    // (~400ms cold start + memory).
    private browser: PuppeteerBrowserLike | null = null;
    private browserInitPromise: Promise<PuppeteerBrowserLike> | null = null;

    async onModuleDestroy(): Promise<void> {
        if (this.browser) {
            await this.browser.close().catch(() => undefined);
            this.browser = null;
        }
    }

    // ── Public API ──────────────────────────────────────────────────────

    /**
     * Pure: produces the HTML document the PDF will be rendered from.
     * No DB / network / filesystem access. Safe to unit-test in isolation.
     */
    buildClientFacingHtml(snapshot: ProposalPdfSnapshot): string {
        const { proposal, company, serviceRequest, client, items } = snapshot;

        const itemsHtml = [...items]
            .sort((a, b) => a.sortOrder - b.sortOrder)
            .map((it, idx) => this.renderItemRow(idx + 1, it))
            .join('');

        const discountLine = this.renderDiscountLine(
            proposal.subtotal,
            proposal.totalPrice,
            proposal.discountPct,
            proposal.discountAmount,
        );

        // The client-facing PDF deliberately omits:
        //   - proposal.notes        (internal)
        //   - proposal.totalCost    (sensitive: INTERNAL_COST)
        //   - item.internalCost     (sensitive: INTERNAL_COST)
        //   - status history        (internal audit trail)
        //   - membership identities (operational)
        //
        // What it includes is the contract we present to the client.
        return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<title>Proposta #${escapeHtml(String(proposal.number))} — ${escapeHtml(proposal.title)}</title>
<style>${PDF_STYLES}</style>
</head>
<body>
  <header class="doc-header">
    <div class="brand">
      <div class="brand-name">${escapeHtml(company.tradeName ?? company.legalName)}</div>
      <div class="brand-meta">${escapeHtml(company.legalName)} · CNPJ ${escapeHtml(company.taxId)}</div>
      <div class="brand-meta">${escapeHtml(company.addressLine)}</div>
    </div>
    <div class="doc-id">
      <div class="doc-id-label">Proposta</div>
      <div class="doc-id-number">#${escapeHtml(String(proposal.number))}</div>
      <div class="doc-id-meta">Aprovada em ${formatDate(proposal.approvedAt)}</div>
    </div>
  </header>

  <section class="party-block">
    <div class="party">
      <div class="party-label">Cliente</div>
      <div class="party-name">${escapeHtml(client?.name ?? '—')}</div>
      ${client?.taxId ? `<div class="party-meta">CPF/CNPJ: ${escapeHtml(client.taxId)}</div>` : ''}
      ${client?.email ? `<div class="party-meta">${escapeHtml(client.email)}</div>` : ''}
      ${client?.phone ? `<div class="party-meta">${escapeHtml(client.phone)}</div>` : ''}
    </div>
    <div class="party">
      <div class="party-label">Solicitação</div>
      <div class="party-name">#${escapeHtml(String(serviceRequest.number))} — ${escapeHtml(serviceRequest.title)}</div>
      ${proposal.validUntil ? `<div class="party-meta">Válida até ${formatDate(proposal.validUntil)}</div>` : ''}
    </div>
  </section>

  <h1 class="proposal-title">${escapeHtml(proposal.title)}</h1>

  <table class="items">
    <thead>
      <tr>
        <th class="num">#</th>
        <th class="desc">Descrição</th>
        <th class="unit">Un.</th>
        <th class="qty">Qtde.</th>
        <th class="price">Valor un.</th>
        <th class="disc">Desc.</th>
        <th class="sub">Subtotal</th>
      </tr>
    </thead>
    <tbody>
      ${itemsHtml || `<tr><td colspan="7" class="empty">Sem itens.</td></tr>`}
    </tbody>
  </table>

  <section class="totals">
    <div class="totals-row">
      <span class="totals-label">Subtotal</span>
      <span class="totals-value">${formatMoney(proposal.subtotal)}</span>
    </div>
    ${discountLine}
    <div class="totals-row totals-grand">
      <span class="totals-label">Total</span>
      <span class="totals-value">${formatMoney(proposal.totalPrice)}</span>
    </div>
  </section>

  ${proposal.clientNotes
                ? `<section class="notes">
        <div class="notes-label">Observações</div>
        <div class="notes-body">${escapeHtml(proposal.clientNotes)}</div>
      </section>`
                : ''
            }

  <footer class="doc-footer">
    <div>Documento gerado eletronicamente em ${formatDateTime(new Date())}.</div>
    <div>Proposta #${escapeHtml(String(proposal.number))} · Aprovada em ${formatDate(proposal.approvedAt)}.</div>
  </footer>
</body>
</html>`;
    }

    /**
     * Render the given HTML string to a PDF Buffer using Puppeteer.
     *
     * Hardened defaults:
     *   - `--no-sandbox` only when running inside a container without
     *     user namespaces (controlled by env to keep dev hosts strict).
     *   - Network is not needed: HTML is fully self-contained (no remote
     *     fonts, no remote images), so we set `setOfflineMode(true)`
     *     to fail-closed if a future template change accidentally pulls
     *     a remote asset.
     *   - A 30s navigation timeout caps a runaway template loop.
     */
    async renderToPdf(html: string): Promise<Buffer> {
        const browser = await this.getBrowser();
        const page = await browser.newPage();
        try {
            await page.setOfflineMode(true);
            await page.setContent(html, {
                waitUntil: 'load',
                timeout: 30_000,
            });

            const pdf = await page.pdf({
                format: 'A4',
                margin: {
                    top: '20mm',
                    bottom: '20mm',
                    left: '15mm',
                    right: '15mm',
                },
                printBackground: true,
                preferCSSPageSize: false,
            });

            // Puppeteer types return Uint8Array in v22+. Normalise to
            // Buffer so the storage layer has a single shape to handle.
            return Buffer.isBuffer(pdf) ? pdf : Buffer.from(pdf);
        } finally {
            await page.close().catch(() => undefined);
        }
    }

    // ── Internals ───────────────────────────────────────────────────────

    private async getBrowser(): Promise<PuppeteerBrowserLike> {
        if (this.browser) return this.browser;
        if (this.browserInitPromise) return this.browserInitPromise;

        this.browserInitPromise = this.launchBrowser()
            .then((b) => {
                this.browser = b;
                return b;
            })
            .finally(() => {
                this.browserInitPromise = null;
            });
        return this.browserInitPromise;
    }

    private async launchBrowser(): Promise<PuppeteerBrowserLike> {
        // Lazy-load. Puppeteer is heavy; deployments that disable the PDF
        // pipeline (PROPOSAL_PDF_ENABLED=false) should not pay its boot
        // cost. `require` is intentional — see the storage driver for the
        // same rationale.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const puppeteer = require('puppeteer') as {
            launch(opts: Record<string, unknown>): Promise<PuppeteerBrowserLike>;
        };

        const args: string[] = ['--disable-dev-shm-usage', '--font-render-hinting=none'];
        if ((process.env['PROPOSAL_PDF_PUPPETEER_NO_SANDBOX'] ?? '').toLowerCase() === 'true') {
            args.push('--no-sandbox', '--disable-setuid-sandbox');
        }

        const browser = await puppeteer.launch({
            headless: true,
            args,
            executablePath: process.env['PROPOSAL_PDF_PUPPETEER_EXECUTABLE'] || undefined,
        });

        this.logger.log('Puppeteer browser launched for proposal PDF rendering.');
        return browser;
    }

    private renderItemRow(
        rowNumber: number,
        item: ProposalPdfSnapshot['items'][number],
    ): string {
        const discount = item.discountPct
            ? `${formatPct(item.discountPct)}`
            : '—';
        return `
      <tr>
        <td class="num">${rowNumber}</td>
        <td class="desc">${escapeHtml(item.description)}</td>
        <td class="unit">${escapeHtml(item.unit ?? '—')}</td>
        <td class="qty">${formatQuantity(item.quantity)}</td>
        <td class="price">${formatMoney(item.unitPrice)}</td>
        <td class="disc">${discount}</td>
        <td class="sub">${formatMoney(item.subtotal)}</td>
      </tr>`;
    }

    private renderDiscountLine(
        subtotal: Prisma.Decimal,
        totalPrice: Prisma.Decimal,
        discountPct: Prisma.Decimal | null,
        discountAmount: Prisma.Decimal | null,
    ): string {
        if (!discountPct && !discountAmount) return '';
        // Show the effective discount as a money value so the client sees
        // exactly how it changes the subtotal — independent of which input
        // form the seller used. Computed from persisted backend totals.
        const delta = subtotal.minus(totalPrice);
        const label = discountPct
            ? `Desconto (${formatPct(discountPct)})`
            : 'Desconto';
        return `
    <div class="totals-row">
      <span class="totals-label">${label}</span>
      <span class="totals-value">−${formatMoney(delta)}</span>
    </div>`;
    }
}

// ── Pure helpers (no DI, no I/O) ─────────────────────────────────────────────

function escapeHtml(input: string): string {
    return input
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function formatMoney(value: Prisma.Decimal): string {
    // pt-BR currency formatting using Intl, fed by a Decimal.toString().
    // Decimal → number is unsafe at large magnitudes; for a 12,2 column
    // the safe cutoff is far above any realistic proposal total, but we
    // still go via toFixed(2) to keep formatting deterministic.
    const fixed = value.toFixed(2);
    const n = Number(fixed);
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(n);
}

function formatQuantity(value: Prisma.Decimal): string {
    // Quantities are stored at 4 dp; trim trailing zeros for readability.
    const fixed = value.toFixed(4);
    return Number(fixed).toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
    });
}

function formatPct(value: Prisma.Decimal): string {
    const n = Number(value.toFixed(2));
    return `${n.toLocaleString('pt-BR', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
    })}%`;
}

function formatDate(d: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC',
    }).format(d);
}

function formatDateTime(d: Date): string {
    return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC',
    }).format(d);
}

// ── Lazy-loaded Puppeteer types ─────────────────────────────────────────────
//
// We do not import `puppeteer` types statically — the dependency is loaded
// at runtime only. The structural types below cover the subset of the API
// the renderer actually calls.

interface PuppeteerBrowserLike {
    newPage(): Promise<PuppeteerPageLike>;
    close(): Promise<void>;
}

interface PuppeteerPageLike {
    setOfflineMode(enabled: boolean): Promise<void>;
    setContent(html: string, opts: { waitUntil: string; timeout: number }): Promise<void>;
    pdf(opts: Record<string, unknown>): Promise<Buffer | Uint8Array>;
    close(): Promise<void>;
}

const PDF_STYLES = `
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; }
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto,
                 "Helvetica Neue", Arial, sans-serif;
    color: #1a1a1a;
    font-size: 11pt;
    line-height: 1.45;
}
.doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 2px solid #1a1a1a;
    padding-bottom: 12px;
    margin-bottom: 18px;
}
.brand-name { font-size: 14pt; font-weight: 700; }
.brand-meta { font-size: 9pt; color: #555; margin-top: 2px; }
.doc-id { text-align: right; }
.doc-id-label { font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
.doc-id-number { font-size: 18pt; font-weight: 700; }
.doc-id-meta { font-size: 9pt; color: #555; margin-top: 2px; }
.party-block {
    display: flex;
    gap: 24px;
    margin-bottom: 18px;
}
.party { flex: 1; }
.party-label { font-size: 9pt; color: #555; text-transform: uppercase; letter-spacing: 0.5px; }
.party-name { font-weight: 600; margin-top: 2px; }
.party-meta { font-size: 9pt; color: #444; margin-top: 1px; }
.proposal-title {
    font-size: 16pt;
    font-weight: 600;
    margin: 6px 0 14px 0;
}
.items {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 14px;
}
.items th, .items td {
    text-align: left;
    padding: 7px 8px;
    border-bottom: 1px solid #e5e5e5;
    vertical-align: top;
}
.items th {
    background: #f6f6f6;
    font-size: 9pt;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #444;
}
.items td.num, .items th.num { width: 32px; text-align: right; color: #666; }
.items td.unit, .items th.unit { width: 50px; text-align: center; }
.items td.qty, .items th.qty { width: 80px; text-align: right; }
.items td.price, .items th.price { width: 110px; text-align: right; }
.items td.disc, .items th.disc { width: 70px; text-align: right; }
.items td.sub, .items th.sub { width: 120px; text-align: right; font-weight: 600; }
.items td.empty { text-align: center; color: #999; padding: 18px; }
.totals {
    margin-left: auto;
    width: 50%;
    margin-bottom: 18px;
}
.totals-row {
    display: flex;
    justify-content: space-between;
    padding: 5px 8px;
    border-bottom: 1px solid #eee;
}
.totals-grand {
    font-size: 13pt;
    font-weight: 700;
    border-top: 2px solid #1a1a1a;
    border-bottom: 2px solid #1a1a1a;
    margin-top: 4px;
}
.notes {
    border-top: 1px solid #e5e5e5;
    padding-top: 10px;
    margin-bottom: 18px;
}
.notes-label { font-size: 9pt; text-transform: uppercase; color: #555; letter-spacing: 0.4px; }
.notes-body { white-space: pre-wrap; margin-top: 4px; }
.doc-footer {
    border-top: 1px solid #e5e5e5;
    padding-top: 10px;
    font-size: 8.5pt;
    color: #777;
    display: flex;
    justify-content: space-between;
}
`;
