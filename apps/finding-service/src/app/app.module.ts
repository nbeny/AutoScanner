import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';

import { FindingController } from './finding.controller';
import { FindingPersister } from './persisters/finding-persister';
import { FindingBatchService } from './finding-batch.service';
import { CorrelationService } from './correlation.service';
import { DedupFindingsService } from './dedup-findings.service';
import { TriageService } from './triage.service';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, MessagingModule.forRoot()],
  controllers: [FindingController],
  providers: [
    FindingPersister,
    FindingBatchService,
    CorrelationService,
    DedupFindingsService,
    TriageService,
  ],
})
export class AppModule {}
