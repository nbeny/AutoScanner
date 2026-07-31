import { Module } from '@nestjs/common';
import { PrismaModule } from '@autoscanner/database';
import { ChainsModule as ChainsRegistryModule } from '@autoscanner/chains';

import { AiRunsModule } from '../ai-runs/ai-runs.module';
import { ChainLauncher } from './chains.service';
import { ChainsResolver } from './chains.resolver';

@Module({
  imports: [
    PrismaModule,
    ChainsRegistryModule,
    // Réutilise QuickScanProvisioner exporté par AiRunsModule.
    AiRunsModule,
  ],
  providers: [ChainLauncher, ChainsResolver],
})
export class ChainsModule {}
