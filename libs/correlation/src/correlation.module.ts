import { Module } from '@nestjs/common';
import { PrismaModule } from '@autoscanner/database';

import { AssetMergeService } from './asset-merge.service';
import { CorrelateFindingsService } from './correlate-findings.service';

/**
 * Correlation module: exposes the AssetMergeService and CorrelateFindingsService
 * for parser-worker (and any other downstream consumer) to inject. PrismaModule
 * is imported so the services can use `PrismaService` without the consumer
 * having to wire it.
 */
@Module({
  imports: [PrismaModule],
  providers: [AssetMergeService, CorrelateFindingsService],
  exports: [AssetMergeService, CorrelateFindingsService],
})
export class CorrelationModule {}
