import { Module } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { CapabilityModule } from '@autoscanner/auth';

import { AuthModule } from '../auth/auth.module';
import { AiRunsResolver } from './ai-runs.resolver';
import { AiRunsService } from './ai-runs.service';
import { QuickScanProvisioner } from './quick-scan-provisioner.service';
import { AiRunEventsSubscriber, AI_RUN_EVENTS_REDIS_SUBSCRIBER } from './ai-run-events.subscriber';

@Module({
  imports: [AuthModule, AppConfigModule, CapabilityModule],
  providers: [
    AiRunsService,
    AiRunsResolver,
    QuickScanProvisioner,
    AiRunEventsSubscriber,
    {
      provide: AI_RUN_EVENTS_REDIS_SUBSCRIBER,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
    },
  ],
  exports: [QuickScanProvisioner],
})
export class AiRunsModule {}
