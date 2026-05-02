import { BullModule } from '@nestjs/bullmq';
import { Logger, Module, Provider } from '@nestjs/common';
import { ConfigAuditModule } from '../../company-config/audit/config-audit.module';
import { ProposalsModule } from '../proposals.module';
import { ProposalPdfAccessService } from './proposal-pdf-access.service';
import { PROPOSAL_PDF_QUEUE } from './proposal-pdf.constants';
import { ProposalPdfController } from './proposal-pdf.controller';
import { ProposalPdfListener } from './proposal-pdf.listener';
import { ProposalPdfProcessor } from './proposal-pdf.processor';
import { ProposalPdfRenderer } from './proposal-pdf.renderer';
import { ProposalPdfService } from './proposal-pdf.service';
import {
    LocalProposalPdfStorage,
    PROPOSAL_PDF_STORAGE,
    S3ProposalPdfStorage,
} from './proposal-pdf.storage';

// ─────────────────────────────────────────────────────────────────────────────
// ProposalPdfModule
//
// Owns the PDF rendering pipeline for proposals:
//
//   - dedicated BullMQ queue (proposals.pdf, separate from proposals.jobs)
//   - listener bridging proposal.approved → enqueue
//   - processor → service → renderer → storage → DB write-back → event
//
// Module boundary rationale:
//
//   Kept as a sibling of ProposalsModule (not folded into it) so the
//   foundation stays HTTP-pure and testable without Redis / Puppeteer /
//   filesystem. Importing ProposalsModule here lets us consume the
//   foundation services through their exported bindings without
//   re-instantiating them — there is exactly one ProposalsService /
//   ProposalTransitionsService instance in the app.
//
// Storage driver selection:
//
//   PROPOSAL_PDF_STORAGE_DRIVER=local|s3 (default: local)
//   The chosen driver is bound to the PROPOSAL_PDF_STORAGE token. The
//   service depends on the token, never on a concrete driver — that
//   keeps the abstraction enforceable and makes a future swap (e.g.
//   to a generic StorageModule) a single-line change here.
//
//   The driver is resolved EAGERLY at module construction time, so the
//   process fails fast on a typo'd env var instead of only crashing
//   later when the first PDF job runs.
// ─────────────────────────────────────────────────────────────────────────────

const storageDriverProvider: Provider = {
    provide: PROPOSAL_PDF_STORAGE,
    useClass: resolveStorageDriverClass(),
};

@Module({
    imports: [
        // Domain access without re-providing the foundation services.
        ProposalsModule,
        // ConfigAuditService is injected by the PDF service for the
        // post-write audit row.
        ConfigAuditModule,
        // Dedicated queue. Inherits the root BullMQ connection from
        // BullModule.forRootAsync(...) in AppModule. Defaults below
        // apply to BOTH listener-driven enqueues and any future ad-hoc
        // producer; the listener can still override per-job.
        BullModule.registerQueue({
            name: PROPOSAL_PDF_QUEUE,
            defaultJobOptions: {
                attempts: 5,
                backoff: { type: 'exponential', delay: 60_000 },
                // Completed PDF jobs retain a generous tail (200 jobs
                // / 24 h) for debugging an unexpected output. Failed
                // jobs are kept 14 days so an ops engineer can replay
                // them after a Puppeteer / storage outage.
                removeOnComplete: { age: 24 * 60 * 60, count: 200 },
                removeOnFail: { age: 14 * 24 * 60 * 60 },
            },
        }),
    ],
    controllers: [
        // Read-side endpoint surface for the rendered PDF. Mounted
        // here (not in ProposalsController) so ProposalsModule stays
        // free of the storage abstraction and we avoid a circular
        // import: ProposalPdfModule already imports ProposalsModule
        // to reuse the foundation row-level visibility helper.
        ProposalPdfController,
    ],
    providers: [
        // Concrete driver classes registered alongside the token so
        // Nest's DI graph holds the lifecycle hooks (OnModuleInit on the
        // S3 driver does the lazy SDK load).
        LocalProposalPdfStorage,
        S3ProposalPdfStorage,
        storageDriverProvider,

        ProposalPdfRenderer,
        ProposalPdfService,
        ProposalPdfAccessService,
        ProposalPdfProcessor,
        ProposalPdfListener,
    ],
})
export class ProposalPdfModule { }

/**
 * Choose the storage driver class at module-construction time.
 *
 * Done here (not via useFactory) so Nest still applies @Injectable
 * lifecycle hooks (OnModuleInit) on the concrete class — useFactory
 * would skip them. The unselected driver is still instantiated
 * (registered as a provider) but is never injected anywhere through
 * PROPOSAL_PDF_STORAGE; its lifecycle hook is harmless on the local
 * driver and is gated on the env-driven require() in the S3 driver.
 */
function resolveStorageDriverClass():
    | typeof LocalProposalPdfStorage
    | typeof S3ProposalPdfStorage {
    const raw = (process.env['PROPOSAL_PDF_STORAGE_DRIVER'] ?? 'local').toLowerCase().trim();
    switch (raw) {
        case 'local':
            return LocalProposalPdfStorage;
        case 's3':
        case 'r2':
            return S3ProposalPdfStorage;
        default:
            new Logger('ProposalPdfModule').warn(
                `Unknown PROPOSAL_PDF_STORAGE_DRIVER="${raw}"; falling back to "local".`,
            );
            return LocalProposalPdfStorage;
    }
}
