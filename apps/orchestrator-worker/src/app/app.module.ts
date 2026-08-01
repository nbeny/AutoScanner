import { Module, type Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';
import { TemplatesModule } from '@autoscanner/templates';
import { EngagementEventsModule } from '@autoscanner/engagement-events';
import { NotificationsFanoutModule } from '@autoscanner/notifications';
import { MessagingModule } from '@autoscanner/messaging';

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
 * Since SP3 scan-worker publishes `scanjob:done:<id>` on every terminal outcome, so this
 * subscribe drives the primary completion path; the poll is a 30 s fallback. See
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
    TemplatesModule,
    ScannerSdkModule,
    AllScannersModule,
    EngagementEventsModule.forRoot(),
    NotificationsFanoutModule,
    MessagingModule.forRoot(),
  ],
  providers: [redisSubscriber, ContextBuilder, StepExecutor, TemplateRunProcessor],
})
export class AppModule {}
