import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { CapabilityModule } from '@autoscanner/auth';
import { QueueName, QueuesModule } from '@autoscanner/queues';

import { AuthModule } from '../auth/auth.module';
import { AiRunsResolver } from './ai-runs.resolver';
import { AiRunsService } from './ai-runs.service';
import { QuickScanProvisioner } from './quick-scan-provisioner.service';
import { AiRunEventsSubscriber, AI_RUN_EVENTS_REDIS_SUBSCRIBER } from './ai-run-events.subscriber';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    QueuesModule,
    BullModule.registerQueue({ name: QueueName.AI_RUNS }),
    CapabilityModule,
  ],
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
})
export class AiRunsModule {}
