import { Injectable } from '@nestjs/common';
import { Prisma, ProposalStatus } from '@prisma/client';
// pdfkit is a CommonJS module whose export IS the constructor (no `.default`).
// The `import = require` form binds it correctly regardless of esModuleInterop.
import PDFDocument = require('pdfkit');

// ─────────────────────────────────────────────────────────────────────────────
// proposal-pdf.renderer.ts
//
// Server-side proposal → PDF rendering with pdfkit (pure JS, no headless
// browser — works on the Render free-tier node runtime; no Chromium).
//
// Sensitive-field discipline (Mechanism A): the renderer ONLY accepts fields
// present on ProposalPdfSnapshot. internalCost, totalCost and internal `notes`
// are intentionally absent from the snapshot type — they cannot be passed in,
// cannot be rendered, cannot leak. Currency comes from backend-computed totals
// (subtotal, totalPrice, item.subtotal); the client never supplies a number
// that reaches the document.
// ─────────────────────────────────────────────────────────────────────────────

/** The exact, narrow shape the renderer accepts — built by ProposalPdfService
 *  from an explicit client-safe Prisma select. No internalCost, no totalCost,
 *  no internal notes. */
export interface ProposalPdfSnapshot {
    company: { legalName: string; tradeName: string | null; taxId: string };
    client: { name: string; number: number } | null;
    proposal: {
        number: number;
        title: string;
        status: ProposalStatus;
        clientNotes: string | null;
        discountPct: Prisma.Decimal | null;
        discountAmount: Prisma.Decimal | null;
        subtotal: Prisma.Decimal;
        totalPrice: Prisma.Decimal;
        validUntil: Date | null;
        createdAt: Date;
        sentAt: Date | null;
        approvedAt: Date | null;
    };
    items: Array<{
        description: string;
        unit: string | null;
        quantity: Prisma.Decimal;
        unitPrice: Prisma.Decimal;
        discountPct: Prisma.Decimal | null;
        subtotal: Prisma.Decimal;
    }>;
}

const BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const QTY = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
const DATE = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' });

const STATUS_LABEL: Record<ProposalStatus, string> = {
    DRAFT: 'Rascunho',
    SENT: 'Enviada',
    APPROVED: 'Aprovada',
    REJECTED: 'Recusada',
    EXPIRED: 'Expirada',
    CANCELLED: 'Cancelada',
};

function brl(d: Prisma.Decimal | null | undefined): string {
    if (d === null || d === undefined) return '—';
    return BRL.format(Number(d));
}

// Page geometry (A4, 50pt margins → 495pt usable width starting at x=50).
const MARGIN = 50;
const PAGE_BOTTOM = 792 - MARGIN; // A4 height 842pt… pdfkit A4 = 595.28 x 841.89
const X = {
    desc: 50,
    unit: 290,
    qty: 340,
    unitPrice: 395,
    disc: 470,
    subtotal: 505,
    end: 545,
} as const;

@Injectable()
export class ProposalPdfRenderer {
    async render(snapshot: ProposalPdfSnapshot): Promise<Buffer> {
        const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        const done = new Promise<Buffer>((resolve, reject) => {
            doc.on('end', () => resolve(Buffer.concat(chunks)));
            doc.on('error', reject);
        });

        this.header(doc, snapshot);
        this.meta(doc, snapshot);
        this.itemsTable(doc, snapshot);
        this.totals(doc, snapshot);
        this.clientNotes(doc, snapshot);
        this.footer(doc);

        doc.end();
        return done;
    }

    private header(doc: PDFKit.PDFDocument, s: ProposalPdfSnapshot): void {
        const companyName = s.company.tradeName ?? s.company.legalName;
        doc.fontSize(18).font('Helvetica-Bold').text(companyName, MARGIN, MARGIN);
        doc.fontSize(9).font('Helvetica').fillColor('#666666').text(`CNPJ ${s.company.taxId}`);
        doc.fillColor('#000000');

        // Right-aligned proposal identifier block.
        const top = MARGIN;
        doc.fontSize(20).font('Helvetica-Bold').text(`Proposta Nº ${s.proposal.number}`, 300, top, {
            width: X.end - 300,
            align: 'right',
        });
        doc.fontSize(9).font('Helvetica').fillColor('#666666').text(
            STATUS_LABEL[s.proposal.status],
            300,
            top + 26,
            { width: X.end - 300, align: 'right' },
        );
        doc.fillColor('#000000');

        doc.moveTo(MARGIN, top + 56).lineTo(X.end, top + 56).strokeColor('#e5e5e5').stroke();
        doc.strokeColor('#000000');
        doc.y = top + 70;
    }

    private meta(doc: PDFKit.PDFDocument, s: ProposalPdfSnapshot): void {
        doc.fontSize(14).font('Helvetica-Bold').fillColor('#000000').text(s.proposal.title, MARGIN, doc.y);
        doc.moveDown(0.4);

        const lines: string[] = [];
        if (s.client) lines.push(`Cliente: ${s.client.name}`);
        const issued = s.proposal.sentAt ?? s.proposal.createdAt;
        lines.push(`Emitida em: ${DATE.format(issued)}`);
        if (s.proposal.validUntil) lines.push(`Válida até: ${DATE.format(s.proposal.validUntil)}`);

        doc.fontSize(10).font('Helvetica').fillColor('#444444');
        for (const line of lines) doc.text(line, MARGIN, doc.y);
        doc.fillColor('#000000');
        doc.moveDown(1);
    }

    private itemsTable(doc: PDFKit.PDFDocument, s: ProposalPdfSnapshot): void {
        this.tableHeader(doc);
        doc.font('Helvetica').fontSize(9).fillColor('#000000');

        for (const item of s.items) {
            // Estimate row height from the wrapping description.
            const descHeight = doc.heightOfString(item.description, { width: X.unit - X.desc - 8 });
            const rowHeight = Math.max(descHeight, 12) + 8;

            if (doc.y + rowHeight > PAGE_BOTTOM) {
                doc.addPage();
                this.tableHeader(doc);
                doc.font('Helvetica').fontSize(9).fillColor('#000000');
            }

            const y = doc.y;
            doc.text(item.description, X.desc, y, { width: X.unit - X.desc - 8 });
            doc.text(item.unit ?? '—', X.unit, y, { width: X.qty - X.unit - 4 });
            doc.text(QTY.format(Number(item.quantity)), X.qty, y, {
                width: X.unitPrice - X.qty - 6,
                align: 'right',
            });
            doc.text(brl(item.unitPrice), X.unitPrice, y, { width: X.disc - X.unitPrice - 6, align: 'right' });
            doc.text(
                item.discountPct !== null ? `${QTY.format(Number(item.discountPct))}%` : '—',
                X.disc,
                y,
                { width: X.subtotal - X.disc - 4, align: 'right' },
            );
            doc.font('Helvetica-Bold').text(brl(item.subtotal), X.subtotal, y, {
                width: X.end - X.subtotal,
                align: 'right',
            });
            doc.font('Helvetica');

            doc.y = y + rowHeight;
            doc.moveTo(MARGIN, doc.y - 4).lineTo(X.end, doc.y - 4).strokeColor('#f0f0f0').stroke();
            doc.strokeColor('#000000');
        }
    }

    private tableHeader(doc: PDFKit.PDFDocument): void {
        const y = doc.y;
        doc.fontSize(8).font('Helvetica-Bold').fillColor('#666666');
        doc.text('DESCRIÇÃO', X.desc, y);
        doc.text('UNID.', X.unit, y);
        doc.text('QTD.', X.qty, y, { width: X.unitPrice - X.qty - 6, align: 'right' });
        doc.text('VALOR UN.', X.unitPrice, y, { width: X.disc - X.unitPrice - 6, align: 'right' });
        doc.text('DESC.', X.disc, y, { width: X.subtotal - X.disc - 4, align: 'right' });
        doc.text('SUBTOTAL', X.subtotal, y, { width: X.end - X.subtotal, align: 'right' });
        doc.fillColor('#000000');
        doc.y = y + 16;
        doc.moveTo(MARGIN, doc.y - 4).lineTo(X.end, doc.y - 4).strokeColor('#cccccc').stroke();
        doc.strokeColor('#000000');
    }

    private totals(doc: PDFKit.PDFDocument, s: ProposalPdfSnapshot): void {
        if (doc.y + 80 > PAGE_BOTTOM) doc.addPage();
        doc.moveDown(0.5);
        const labelX = 340;
        const valX = X.subtotal;
        const valW = X.end - X.subtotal;

        const row = (label: string, value: string, bold = false) => {
            const y = doc.y;
            doc.fontSize(bold ? 12 : 10).font(bold ? 'Helvetica-Bold' : 'Helvetica');
            doc.fillColor(bold ? '#000000' : '#444444').text(label, labelX, y, {
                width: valX - labelX - 8,
                align: 'right',
            });
            doc.fillColor('#000000').text(value, valX, y, { width: valW, align: 'right' });
            doc.moveDown(0.4);
        };

        row('Subtotal', brl(s.proposal.subtotal));
        if (s.proposal.discountPct !== null) {
            row('Desconto', `− ${QTY.format(Number(s.proposal.discountPct))}%`);
        } else if (s.proposal.discountAmount !== null) {
            row('Desconto', `− ${brl(s.proposal.discountAmount)}`);
        }
        doc.moveTo(labelX, doc.y).lineTo(X.end, doc.y).strokeColor('#cccccc').stroke();
        doc.strokeColor('#000000');
        doc.moveDown(0.3);
        row('Total', brl(s.proposal.totalPrice), true);
    }

    private clientNotes(doc: PDFKit.PDFDocument, s: ProposalPdfSnapshot): void {
        const notes = s.proposal.clientNotes?.trim();
        if (!notes) return;
        if (doc.y + 60 > PAGE_BOTTOM) doc.addPage();
        doc.moveDown(1.5);
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#666666').text('OBSERVAÇÕES', MARGIN, doc.y);
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica').fillColor('#000000').text(notes, MARGIN, doc.y, {
            width: X.end - MARGIN,
        });
    }

    private footer(doc: PDFKit.PDFDocument): void {
        const range = doc.bufferedPageRange();
        for (let i = 0; i < range.count; i++) {
            doc.switchToPage(range.start + i);
            doc.fontSize(8).font('Helvetica').fillColor('#999999').text(
                `Gerado por Orkestree · ${DATE.format(new Date())} · Página ${i + 1} de ${range.count}`,
                MARGIN,
                PAGE_BOTTOM + 12,
                { width: X.end - MARGIN, align: 'center' },
            );
        }
        doc.fillColor('#000000');
    }
}
