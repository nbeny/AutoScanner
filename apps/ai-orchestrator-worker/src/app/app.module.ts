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
import { ChainsModule } from '@autoscanner/chains';

import { AiRunProcessor } from './ai-run.processor';
import { AiRunEventsPublisher, AI_RUN_EVENTS_REDIS } from './ai-run-events.publisher';
import { WorldStateService } from './world-state.service';
import { ResolvableEntitiesLoader } from './entities-loader.service';
import { ClaudeDecider } from './claude-decider';
import { ChainDecider } from './chain-decider';

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

/**
 * Publishing client for {@link AiRunEventsPublisher}. Separate from the
 * dispatcher's subscriber connection (a subscriber cannot issue PUBLISH).
 */
const aiRunEventsRedis: Provider = {
  provide: AI_RUN_EVENTS_REDIS,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService): IORedis =>
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
    ChainsModule,
  ],
  providers: [
    scanDispatchRedisSubscriber,
    aiRunEventsRedis,
    WorldStateService,
    ResolvableEntitiesLoader,
    ClaudeDecider,
    ChainDecider,
    AiRunEventsPublisher,
    AiRunProcessor,
  ],
})
export class AppModule {}
