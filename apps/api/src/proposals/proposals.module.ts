import { Module } from '@nestjs/common';
import { ConfigAuditModule } from '../company-config/audit/config-audit.module';
import { ProposalItemsService } from './proposal-items.service';
import { ProposalTransitionsService } from './proposal-transitions.service';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

@Module({
    imports: [ConfigAuditModule],
    controllers: [ProposalsController],
    providers: [ProposalsService, ProposalItemsService, ProposalTransitionsService],
    exports: [ProposalsService, ProposalItemsService, ProposalTransitionsService],
})
export class ProposalsModule { }
