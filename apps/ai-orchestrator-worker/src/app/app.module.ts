import { Module, type Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { MessagingModule } from '@autoscanner/messaging';
import { PrismaModule } from '@autoscanner/database';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';
import { ClaudeAgentModule } from '@autoscanner/claude-agent';
import { SecurityAgentsModule } from '@autoscanner/security-agents';
import {
  ScanDispatcher,
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
import { FindingEnrichmentService } from './finding-enrichment.service';

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
    MessagingModule.forRoot(),
    ScannerSdkModule,
    AllScannersModule,
    ClaudeAgentModule,
    SecurityAgentsModule,
    EngagementEventsModule.forRoot(),
    ChainsModule,
  ],
  providers: [
    scanDispatchRedisSubscriber,
    aiRunEventsRedis,
    FindingEnrichmentService,
    // Provided directly here (not via ScanDispatchModule) so ScanDispatcher can
    // resolve the app-scoped SCAN_DISPATCH_REDIS_SUBSCRIBER token — a module
    // provider is otherwise invisible to the encapsulated ScanDispatchModule.
    ScanDispatcher,
    WorldStateService,
    ResolvableEntitiesLoader,
    ClaudeDecider,
    ChainDecider,
    AiRunEventsPublisher,
    AiRunProcessor,
  ],
})
export class AppModule {}
