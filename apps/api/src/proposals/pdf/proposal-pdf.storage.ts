import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { PROPOSAL_PDF_STORAGE_PREFIX } from './proposal-pdf.constants';

// ─────────────────────────────────────────────────────────────────────────────
// proposal-pdf.storage.ts
//
// Minimal storage abstraction for proposal PDFs. Two drivers ship in this
// PR; the active one is selected by PROPOSAL_PDF_STORAGE_DRIVER:
//
//   - "local" (default): writes to the local filesystem under
//     PROPOSAL_PDF_LOCAL_DIR. Intended for dev / CI / preview environments
//     where running an S3-compatible service is overkill. The returned URL
//     is a relative path the API can serve via a future static-files route.
//
//   - "s3":   writes to an S3-compatible bucket (R2, MinIO, AWS S3) using
//     the AWS SDK v3 if installed at runtime. The SDK is loaded lazily so
//     local-driver deployments don't need it on the classpath.
//
// Why a tiny in-house abstraction instead of a generic storage module?
//   - There is no existing storage abstraction in the repo (verified at
//     PR-time). Introducing a generic, app-wide module would expand scope
//     well beyond proposal PDFs.
//   - The interface is intentionally minimal (`putPdf` only) — it can be
//     extended or extracted into `apps/api/src/storage/` later when the
//     second consumer (e.g. invoice PDFs, contract attachments) lands.
//
// Idempotency contract:
//   Callers MUST provide a deterministic objectKey. Re-calling putPdf with
//   the same key is a safe overwrite for the same content, and is the
//   intended behaviour when BullMQ retries a previously-failed job whose
//   storage upload completed before the DB write-back.
// ─────────────────────────────────────────────────────────────────────────────

/** Public URL returned by a successful upload. */
export type PutPdfResult = {
    /**
     * Absolute or relative URL the API can persist to Proposal.pdfUrl. For
     * the local driver this is a relative path under the API origin; for S3
     * it is the public/presigned URL configured by the operator.
     */
    url: string;
    /** Object key as written to storage (for audit / forensic lookups). */
    objectKey: string;
    /** Size of the uploaded payload in bytes (for audit / monitoring). */
    bytes: number;
};

export interface ProposalPdfStorage {
    /**
     * Persist a PDF payload at a deterministic key. Implementations MUST
     * treat repeated calls with the same key as overwrite-safe.
     *
     * @param objectKey  Storage key — produced by buildObjectKey() below.
     *                   MUST NOT include a leading slash.
     * @param payload    The rendered PDF bytes.
     * @param contentType Always 'application/pdf' in production; passed
     *                    through so future preview formats can reuse the
     *                    abstraction.
     */
    putPdf(
        objectKey: string,
        payload: Buffer,
        contentType: string,
    ): Promise<PutPdfResult>;
}

/**
 * Build the canonical object key for a proposal PDF. Shared by the renderer
 * and any future re-fetch path. Format:
 *
 *   <prefix>/<companyId>/<proposalId>/<approvedAtEpochMs>.pdf
 *
 * - companyId comes first so per-tenant lifecycle policies (TTL, archival,
 *   deletion) can be applied via a single S3 prefix rule.
 * - approvedAtEpochMs makes the key content-addressed for terminal APPROVED
 *   state — a new approval (if ever supported) lands at a new key, never
 *   silently overwriting prior audit history.
 */
export function buildProposalPdfObjectKey(input: {
    companyId: string;
    proposalId: string;
    approvedAtEpochMs: number;
}): string {
    // Defence-in-depth: companyId / proposalId come from server-side rows
    // (not the job payload directly), but we still validate they are safe
    // path segments. cuid() ids are alphanumeric so this is a cheap belt.
    assertSafeSegment(input.companyId, 'companyId');
    assertSafeSegment(input.proposalId, 'proposalId');
    return [
        PROPOSAL_PDF_STORAGE_PREFIX,
        input.companyId,
        input.proposalId,
        `${input.approvedAtEpochMs}.pdf`,
    ].join('/');
}

function assertSafeSegment(value: string, name: string): void {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) {
        throw new Error(
            `Refusing to build storage key: ${name} contains characters outside [A-Za-z0-9_-]`,
        );
    }
}

// ── Local filesystem driver ─────────────────────────────────────────────────

@Injectable()
export class LocalProposalPdfStorage
    implements ProposalPdfStorage, OnModuleInit {
    private readonly logger = new Logger(LocalProposalPdfStorage.name);
    private readonly baseDir: string;
    private readonly publicBaseUrl: string;

    constructor() {
        this.baseDir = path.resolve(
            process.env['PROPOSAL_PDF_LOCAL_DIR'] ?? './var/proposal-pdfs',
        );
        // Public URL prefix the API will serve files under. Default is a
        // path-only prefix; the frontend resolves it against the API origin.
        // Operators pointing at an external CDN can override.
        this.publicBaseUrl = (
            process.env['PROPOSAL_PDF_PUBLIC_BASE_URL'] ?? '/files'
        ).replace(/\/+$/, '');
    }

    async onModuleInit(): Promise<void> {
        await fs.mkdir(this.baseDir, { recursive: true });
        this.logger.log(
            `LocalProposalPdfStorage ready (baseDir=${this.baseDir}, publicBaseUrl=${this.publicBaseUrl}).`,
        );
    }

    async putPdf(
        objectKey: string,
        payload: Buffer,
        _contentType: string,
    ): Promise<PutPdfResult> {
        const fullPath = path.join(this.baseDir, objectKey);
        const dir = path.dirname(fullPath);

        // Defence-in-depth: a malformed key with .. would escape baseDir.
        const resolved = path.resolve(fullPath);
        if (!resolved.startsWith(path.resolve(this.baseDir) + path.sep)) {
            throw new Error(
                `Refusing to write outside baseDir: objectKey=${objectKey}`,
            );
        }

        await fs.mkdir(dir, { recursive: true });

        // Atomic write: write to a temp file, then rename. Prevents readers
        // (or a concurrent worker on the same key) from observing a partial
        // file mid-write. fs.rename is atomic on POSIX within the same FS.
        const tmpPath = `${fullPath}.tmp-${process.pid}-${Date.now()}`;
        await fs.writeFile(tmpPath, payload);
        try {
            await fs.rename(tmpPath, fullPath);
        } catch (err) {
            await fs.unlink(tmpPath).catch(() => undefined);
            throw err;
        }

        return {
            url: `${this.publicBaseUrl}/${objectKey}`,
            objectKey,
            bytes: payload.byteLength,
        };
    }
}

// ── S3 / R2 driver ──────────────────────────────────────────────────────────
//
// Loads @aws-sdk/client-s3 lazily so local-driver deployments don't require
// the dependency to be installed. Operators choosing the s3 driver MUST
// install @aws-sdk/client-s3 and set:
//
//   PROPOSAL_PDF_STORAGE_DRIVER=s3
//   PROPOSAL_PDF_S3_ENDPOINT=...     (R2 / MinIO endpoint; omit for AWS S3)
//   PROPOSAL_PDF_S3_REGION=auto      (R2 uses "auto")
//   PROPOSAL_PDF_S3_BUCKET=...
//   PROPOSAL_PDF_S3_ACCESS_KEY=...
//   PROPOSAL_PDF_S3_SECRET_KEY=...
//   PROPOSAL_PDF_S3_PUBLIC_BASE_URL=https://cdn.example.com  (optional)
//   PROPOSAL_PDF_S3_FORCE_PATH_STYLE=true  (true for MinIO / some R2 setups)

interface S3ClientLike {
    send(command: unknown): Promise<unknown>;
}

@Injectable()
export class S3ProposalPdfStorage implements ProposalPdfStorage, OnModuleInit {
    private readonly logger = new Logger(S3ProposalPdfStorage.name);
    private client: S3ClientLike | null = null;
    private putObjectCommandCtor: new (input: unknown) => unknown = null as never;

    private readonly bucket: string;
    private readonly publicBaseUrl: string | null;

    constructor() {
        this.bucket = requireEnv('PROPOSAL_PDF_S3_BUCKET');
        this.publicBaseUrl =
            (process.env['PROPOSAL_PDF_S3_PUBLIC_BASE_URL'] ?? '').replace(
                /\/+$/,
                '',
            ) || null;
    }

    async onModuleInit(): Promise<void> {
        // Lazy-load so local-driver deployments don't need the SDK installed.
        // `require` is intentional — `import()` would force tsc to emit a
        // hard module reference that would fail compilation when the SDK is
        // absent.
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const sdk = require('@aws-sdk/client-s3') as {
            S3Client: new (config: Record<string, unknown>) => S3ClientLike;
            PutObjectCommand: new (input: unknown) => unknown;
        };

        this.client = new sdk.S3Client({
            endpoint: process.env['PROPOSAL_PDF_S3_ENDPOINT'] || undefined,
            region: process.env['PROPOSAL_PDF_S3_REGION'] ?? 'auto',
            forcePathStyle:
                (process.env['PROPOSAL_PDF_S3_FORCE_PATH_STYLE'] ?? '')
                    .toLowerCase() === 'true',
            credentials: {
                accessKeyId: requireEnv('PROPOSAL_PDF_S3_ACCESS_KEY'),
                secretAccessKey: requireEnv('PROPOSAL_PDF_S3_SECRET_KEY'),
            },
        });
        this.putObjectCommandCtor = sdk.PutObjectCommand;

        this.logger.log(
            `S3ProposalPdfStorage ready (bucket=${this.bucket}, ` +
            `endpoint=${process.env['PROPOSAL_PDF_S3_ENDPOINT'] ?? 'aws-default'}).`,
        );
    }

    async putPdf(
        objectKey: string,
        payload: Buffer,
        contentType: string,
    ): Promise<PutPdfResult> {
        if (!this.client) {
            throw new Error(
                'S3ProposalPdfStorage was used before onModuleInit() finished.',
            );
        }

        const command = new this.putObjectCommandCtor({
            Bucket: this.bucket,
            Key: objectKey,
            Body: payload,
            ContentType: contentType,
            // We never want a stale CDN edge to serve a previous render of
            // the same approvedAt key. Since the key is content-addressed
            // by approvedAtEpochMs anyway, immutable cache is correct.
            CacheControl: 'public, max-age=31536000, immutable',
        });
        await this.client.send(command);

        const url = this.publicBaseUrl
            ? `${this.publicBaseUrl}/${objectKey}`
            : // Fallback to a path-style URL relative to the configured
              // endpoint. Operators who do NOT set a public base URL are
              // expected to front the bucket with an authenticated proxy.
              `s3://${this.bucket}/${objectKey}`;

        return { url, objectKey, bytes: payload.byteLength };
    }
}

function requireEnv(name: string): string {
    const v = process.env[name];
    if (!v || v.trim().length === 0) {
        throw new Error(
            `S3 storage driver requires ${name} but it is unset or empty.`,
        );
    }
    return v;
}

/**
 * DI token for the storage abstraction. The concrete implementation is
 * picked at module-construction time based on PROPOSAL_PDF_STORAGE_DRIVER.
 */
export const PROPOSAL_PDF_STORAGE = Symbol('PROPOSAL_PDF_STORAGE');
