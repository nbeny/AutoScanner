import { Module, type Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { QueuesModule } from '@autoscanner/queues';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SubfinderScannerModule } from '@autoscanner/scanners-subfinder';
import { HttpxScannerModule } from '@autoscanner/scanners-httpx';
import { TemplatesModule } from '@autoscanner/templates';

import { ContextBuilder } from './context-builder.service';
import {
  ORCHESTRATOR_REDIS_SUBSCRIBER,
  type OrchestratorRedisSubscriber,
} from './orchestrator-redis.tokens';
import { StepExecutor } from './step-executor.service';
import { TemplateRunProcessor } from './template-run.processor';

/**
 * Dedicated Redis subscriber client for the orchestrator. A pub/sub subscriber
 * must use a connection separate from any client running commands, hence the
 * private provider here (`LogStreamModule` owns a different pair).
 *
 * Today nothing publishes to `scanjob:done:<id>` — the subscribe is a
 * future-proof hook. Polling is the load-bearing completion strategy. See
 * {@link StepExecutor} for details.
 */
const redisSubscriber: Provider = {
  provide: ORCHESTRATOR_REDIS_SUBSCRIBER,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService): OrchestratorRedisSubscriber =>
    new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
};

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    QueuesModule,
    TemplatesModule,
    ScannerSdkModule,
    // Concrete scanners need to register themselves in `ScannerRegistry` so
    // `StepExecutor` can look up their `defaultTimeoutMs`.
    SubfinderScannerModule,
    HttpxScannerModule,
  ],
  providers: [redisSubscriber, ContextBuilder, StepExecutor, TemplateRunProcessor],
})
export class AppModule {}
