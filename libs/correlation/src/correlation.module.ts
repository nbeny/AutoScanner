import { Module } from '@nestjs/common';
import { PrismaModule } from '@autoscanner/database';

import { AssetMergeService } from './asset-merge.service';

/**
 * Correlation module: exposes the AssetMergeService for parser-worker (and
 * any other downstream consumer) to inject. PrismaModule is imported so the
 * service can use `PrismaService` without the consumer having to wire it.
 */
@Module({
  imports: [PrismaModule],
  providers: [AssetMergeService],
  exports: [AssetMergeService],
})
export class CorrelationModule {}
