import { Module } from '@nestjs/common';
import { ConfigAuditModule } from '../company-config/audit/config-audit.module';
import { ProposalFieldValuesService } from './proposal-field-values.service';
import { ProposalItemsService } from './proposal-items.service';
import { ProposalTransitionsService } from './proposal-transitions.service';
import { ProposalsController } from './proposals.controller';
import { ProposalsService } from './proposals.service';

// PermissionResolverService is provided by the @Global PermissionsModule
// (declared in CompanyConfigModule) so no explicit import is needed here.
// PrismaService is provided by the @Global PrismaModule.
// EventEmitter2 is provided by EventEmitterModule.forRoot in AppModule.

@Module({
    imports: [ConfigAuditModule],
    controllers: [ProposalsController],
    providers: [
        ProposalsService,
        ProposalItemsService,
        ProposalTransitionsService,
        ProposalFieldValuesService,
    ],
    exports: [ProposalsService, ProposalTransitionsService],
})
export class ProposalsModule { }
