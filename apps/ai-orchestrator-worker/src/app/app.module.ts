import { BullModule } from '@nestjs/bullmq';
import { Module, type Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { QueuesModule, QueueName } from '@autoscanner/queues';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';
import { ClaudeAgentModule } from '@autoscanner/claude-agent';
import {
  ScanDispatchModule,
  SCAN_DISPATCH_REDIS_SUBSCRIBER,
  type ScanDispatchRedisSubscriber,
} from '@autoscanner/scan-dispatch';
import { EngagementEventsModule } from '@autoscanner/engagement-events';

import { AiRunProcessor } from './ai-run.processor';

/**
 * Dedicated Redis subscriber client for the {@link ScanDispatcher}. A pub/sub
 * subscriber must use a connection separate from any client running commands,
 * hence the private provider here (mirrors orchestrator-worker's
 * `ORCHESTRATOR_REDIS_SUBSCRIBER`).
 */
const scanDispatchRedisSubscriber: Provider = {
  provide: SCAN_DISPATCH_REDIS_SUBSCRIBER,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService): ScanDispatchRedisSubscriber =>
    new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
};

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    QueuesModule,
    // The shared QueuesModule does not register `ai-runs`; register it here so
    // this worker can attach a `@Processor(QueueName.AI_RUNS)` and (later)
    // `@InjectQueue(QueueName.AI_RUNS)` for reconcile.
    BullModule.registerQueue({ name: QueueName.AI_RUNS }),
    ScannerSdkModule,
    AllScannersModule,
    ClaudeAgentModule,
    ScanDispatchModule,
    EngagementEventsModule.forRoot(),
  ],
  providers: [scanDispatchRedisSubscriber, AiRunProcessor],
})
export class AppModule {}
