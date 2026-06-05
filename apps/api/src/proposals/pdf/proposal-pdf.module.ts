import { Module } from '@nestjs/common';
import { ProposalsModule } from '../proposals.module';
import { ProposalPdfController } from './proposal-pdf.controller';
import { ProposalPdfRenderer } from './proposal-pdf.renderer';
import { ProposalPdfService } from './proposal-pdf.service';

// ProposalsModule is imported for ProposalsService (row-level visibility via
// assertCanReadProposal). PrismaService comes from the @Global PrismaModule.
@Module({
    imports: [ProposalsModule],
    controllers: [ProposalPdfController],
    providers: [ProposalPdfService, ProposalPdfRenderer],
})
export class ProposalPdfModule {}
