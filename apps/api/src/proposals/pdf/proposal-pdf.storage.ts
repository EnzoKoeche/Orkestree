import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createReadStream, promises as fs } from 'fs';
import * as path from 'path';
import { Readable } from 'stream';
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
//     is a relative path; the API itself serves the bytes via the access
//     surface (controller → service → readObject() stream).
//
//   - "s3":   writes to an S3-compatible bucket (R2, MinIO, AWS S3) using
//     the AWS SDK v3 if installed at runtime. The SDK is loaded lazily so
//     local-driver deployments don't need it on the classpath. The access
//     surface returns short-lived presigned URLs (302 redirect) instead of
//     streaming through the API.
//
// Why a tiny in-house abstraction instead of a generic storage module?
//   - There is no existing storage abstraction in the repo (verified at
//     PR-time). Introducing a generic, app-wide module would expand scope
//     well beyond proposal PDFs.
//   - The interface is intentionally minimal — it can be extended or
//     extracted into `apps/api/src/storage/` later when a second consumer
//     (e.g. invoice PDFs, contract attachments) lands.
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
     * URL the API persists to Proposal.pdfUrl. For the local driver this
     * is a path-relative URL the access surface ignores (it streams via
     * readObject instead). For S3 it is the public/CDN URL when one is
     * configured; otherwise an `s3://` placeholder. The access surface
     * never trusts this value for read access — it always rebuilds the
     * objectKey server-side from the proposal row.
     */
    url: string;
    /** Object key as written to storage (for audit / forensic lookups). */
    objectKey: string;
    /** Size of the uploaded payload in bytes (for audit / monitoring). */
    bytes: number;
};

/**
 * Authorised read access to a previously-uploaded PDF object. The shape
 * is a discriminated union so the access controller can branch on the
 * driver's strategy without leaking driver-specific details upstream:
 *
 *   - `kind: 'redirect'` — driver wants the API to 302 the caller to a
 *     short-lived URL (presigned S3 / R2). The URL is privileged: it
 *     grants read access for `expiresInSeconds` and MUST NOT be
 *     persisted by the API.
 *
 *   - `kind: 'stream'` — driver wants the API to stream the bytes
 *     itself. Used by the local driver, where there is no public URL
 *     and the API IS the storage front. The stream MUST be consumed or
 *     destroyed by the caller; abandoning it leaks file descriptors.
 *
 * Tenant safety is the *caller's* responsibility — readObject does not
 * re-validate the (companyId, proposalId) tuple. The access service
 * derives the objectKey server-side from a row it has already
 * authorised, so the driver is asked to read a key that has already
 * passed permission gating.
 */
export type ReadAccess =
    | {
        kind: 'redirect';
        url: string;
        expiresInSeconds: number;
    }
    | {
        kind: 'stream';
        body: Readable;
        bytes: number;
        lastModified: Date;
    };

export type ReadObjectError =
    | { kind: 'not-found' }
    | { kind: 'storage-error'; cause: Error };

export type ReadObjectResult =
    | { ok: true; access: ReadAccess }
    | { ok: false; error: ReadObjectError };

export interface ProposalPdfStorage {
    /**
     * Persist a PDF payload at a deterministic key. Implementations MUST
     * treat repeated calls with the same key as overwrite-safe.
     *
     * @param objectKey  Storage key — produced by buildProposalPdfObjectKey().
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

    /**
     * Open authorised read access to a previously-uploaded object.
     *
     * Returns a discriminated `ReadAccess` (stream | redirect) on
     * success. Returns a structured `ReadObjectError` (does NOT throw)
     * when the object cannot be served — the caller maps these to HTTP
     * responses.
     *
     * The objectKey passed in MUST be the canonical one produced by
     * buildProposalPdfObjectKey(...). Driver implementations MUST
     * additionally re-validate the segment shape as defence-in-depth.
     */
    readObject(objectKey: string): Promise<ReadObjectResult>;
}

/**
 * Build the canonical object key for a proposal PDF. Shared by the
 * renderer, the storage drivers, and the access surface. Format:
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
    if (
        !Number.isFinite(input.approvedAtEpochMs) ||
        input.approvedAtEpochMs <= 0 ||
        !Number.isInteger(input.approvedAtEpochMs)
    ) {
        throw new Error(
            'Refusing to build storage key: approvedAtEpochMs must be a positive integer.',
        );
    }
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

/**
 * Last-line-of-defence shape check applied by both drivers' readObject().
 * Canonical keys produced by buildProposalPdfObjectKey() match the
 * pattern `<prefix>/<companyId>/<proposalId>/<digits>.pdf` where every
 * segment is [A-Za-z0-9_-]. Anything else is rejected as not-found
 * before any I/O is issued — even though the access service builds the
 * key from server-side rows, a future caller bug must not let `..` or a
 * leading `/` reach the filesystem or S3 SDK.
 */
function isSafeObjectKey(objectKey: string): boolean {
    return /^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/\d+\.pdf$/.test(
        objectKey,
    );
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
        // Path-only prefix recorded on Proposal.pdfUrl. The access surface
        // does NOT use this for read access — it always streams via
        // readObject(). The value is informational only (audit, debugging).
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

    async readObject(objectKey: string): Promise<ReadObjectResult> {
        // Re-validate the key shape. The access service already builds
        // the key from server-side rows, but the driver is the last
        // line of defence — a future caller bug must not let a `..`
        // segment or a leading `/` leak through.
        if (!isSafeObjectKey(objectKey)) {
            return { ok: false, error: { kind: 'not-found' } };
        }

        const fullPath = path.join(this.baseDir, objectKey);
        const resolved = path.resolve(fullPath);
        const baseResolved = path.resolve(this.baseDir);

        // Identical guard to putPdf: reject anything that resolved
        // outside baseDir, no matter how the key looked syntactically.
        if (!resolved.startsWith(baseResolved + path.sep)) {
            return { ok: false, error: { kind: 'not-found' } };
        }

        let stat: Awaited<ReturnType<typeof fs.stat>>;
        try {
            stat = await fs.stat(resolved);
        } catch (err) {
            const e = err as NodeJS.ErrnoException;
            if (e.code === 'ENOENT' || e.code === 'ENOTDIR') {
                return { ok: false, error: { kind: 'not-found' } };
            }
            return { ok: false, error: { kind: 'storage-error', cause: e } };
        }
        if (!stat.isFile()) {
            return { ok: false, error: { kind: 'not-found' } };
        }

        // Open a read stream. The caller MUST consume or destroy it; we
        // hand it off as-is so the controller can pipe it into the HTTP
        // response without buffering.
        const body = createReadStream(resolved);
        return {
            ok: true,
            access: {
                kind: 'stream',
                body,
                bytes: stat.size,
                lastModified: stat.mtime,
            },
        };
    }
}

// ── S3 / R2 driver ──────────────────────────────────────────────────────────
//
// Loads @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner lazily so
// local-driver deployments don't require the dependencies to be installed.
// Operators choosing the s3 driver MUST install both, plus set:
//
//   PROPOSAL_PDF_STORAGE_DRIVER=s3
//   PROPOSAL_PDF_S3_ENDPOINT=...     (R2 / MinIO endpoint; omit for AWS S3)
//   PROPOSAL_PDF_S3_REGION=auto      (R2 uses "auto")
//   PROPOSAL_PDF_S3_BUCKET=...
//   PROPOSAL_PDF_S3_ACCESS_KEY=...
//   PROPOSAL_PDF_S3_SECRET_KEY=...
//   PROPOSAL_PDF_S3_PUBLIC_BASE_URL=https://cdn.example.com  (optional;
//                                    persisted on Proposal.pdfUrl only)
//   PROPOSAL_PDF_S3_FORCE_PATH_STYLE=true  (true for MinIO / some R2 setups)
//   PROPOSAL_PDF_S3_READ_TTL_SECONDS=300   (presigned URL TTL; cap 3600)

interface S3ClientLike {
    send(command: unknown): Promise<unknown>;
}

@Injectable()
export class S3ProposalPdfStorage implements ProposalPdfStorage, OnModuleInit {
    private readonly logger = new Logger(S3ProposalPdfStorage.name);
    private client: S3ClientLike | null = null;
    private putObjectCommandCtor: new (input: unknown) => unknown = null as never;
    private getObjectCommandCtor: new (input: unknown) => unknown = null as never;
    private headObjectCommandCtor: new (input: unknown) => unknown = null as never;
    private getSignedUrlFn:
        | ((client: unknown, command: unknown, opts: { expiresIn: number }) => Promise<string>)
        | null = null;

    private readonly bucket: string;
    private readonly publicBaseUrl: string | null;
    private readonly readUrlTtlSeconds: number;

    constructor() {
        this.bucket = requireEnv('PROPOSAL_PDF_S3_BUCKET');
        this.publicBaseUrl =
            (process.env['PROPOSAL_PDF_S3_PUBLIC_BASE_URL'] ?? '').replace(
                /\/+$/,
                '',
            ) || null;
        // Short TTL for presigned URLs. The PDF is a confidential pricing
        // document; the signed URL should expire well before any plausible
        // share/forward window. 5 min is the conservative default; cap at
        // 1 h to limit blast radius of a leaked URL.
        const ttl = Number.parseInt(
            process.env['PROPOSAL_PDF_S3_READ_TTL_SECONDS'] ?? '',
            10,
        );
        this.readUrlTtlSeconds =
            Number.isInteger(ttl) && ttl > 0 && ttl <= 3600 ? ttl : 300;
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
            GetObjectCommand: new (input: unknown) => unknown;
            HeadObjectCommand: new (input: unknown) => unknown;
        };
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const presigner = require('@aws-sdk/s3-request-presigner') as {
            getSignedUrl: (
                client: unknown,
                command: unknown,
                opts: { expiresIn: number },
            ) => Promise<string>;
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
        this.getObjectCommandCtor = sdk.GetObjectCommand;
        this.headObjectCommandCtor = sdk.HeadObjectCommand;
        this.getSignedUrlFn = presigner.getSignedUrl;

        this.logger.log(
            `S3ProposalPdfStorage ready (bucket=${this.bucket}, ` +
            `endpoint=${process.env['PROPOSAL_PDF_S3_ENDPOINT'] ?? 'aws-default'}, ` +
            `readUrlTtlSeconds=${this.readUrlTtlSeconds}).`,
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
              // expected to read via the access surface (presigned URL).
              `s3://${this.bucket}/${objectKey}`;

        return { url, objectKey, bytes: payload.byteLength };
    }

    async readObject(objectKey: string): Promise<ReadObjectResult> {
        if (!this.client || !this.getSignedUrlFn) {
            return {
                ok: false,
                error: {
                    kind: 'storage-error',
                    cause: new Error('S3 driver not yet initialised.'),
                },
            };
        }
        if (!isSafeObjectKey(objectKey)) {
            return { ok: false, error: { kind: 'not-found' } };
        }

        // HEAD first so we return `not-found` cleanly instead of generating
        // a presigned URL that 404s on the client. This also avoids signing
        // for objects deleted by a lifecycle policy.
        try {
            const head = new this.headObjectCommandCtor({
                Bucket: this.bucket,
                Key: objectKey,
            });
            await this.client.send(head);
        } catch (err) {
            const e = err as { name?: string; $metadata?: { httpStatusCode?: number } };
            if (
                e?.name === 'NotFound' ||
                e?.name === 'NoSuchKey' ||
                e?.$metadata?.httpStatusCode === 404
            ) {
                return { ok: false, error: { kind: 'not-found' } };
            }
            return {
                ok: false,
                error: { kind: 'storage-error', cause: err as Error },
            };
        }

        const get = new this.getObjectCommandCtor({
            Bucket: this.bucket,
            Key: objectKey,
            // Force the browser to render the file as a proposal PDF
            // regardless of the bucket-level metadata.
            ResponseContentType: 'application/pdf',
        });

        let signedUrl: string;
        try {
            signedUrl = await this.getSignedUrlFn(this.client, get, {
                expiresIn: this.readUrlTtlSeconds,
            });
        } catch (err) {
            return {
                ok: false,
                error: { kind: 'storage-error', cause: err as Error },
            };
        }

        return {
            ok: true,
            access: {
                kind: 'redirect',
                url: signedUrl,
                expiresInSeconds: this.readUrlTtlSeconds,
            },
        };
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
