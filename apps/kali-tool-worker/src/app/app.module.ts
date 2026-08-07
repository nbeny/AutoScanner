import { Module, type Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { DockerRunnerModule } from '@autoscanner/docker-runner';
import { StorageModule } from '@autoscanner/storage';
import { MessagingModule } from '@autoscanner/messaging';

import {
  KaliToolRunEventsPublisher,
  KALI_TOOL_RUN_EVENTS_REDIS,
} from './kali-tool-run-events.publisher';
import { KaliRunProcessor } from './kali-run.processor';

const eventsRedisProvider: Provider = {
  provide: KALI_TOOL_RUN_EVENTS_REDIS,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
};

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    DockerRunnerModule,
    StorageModule,
    MessagingModule.forRoot(),
  ],
  providers: [eventsRedisProvider, KaliToolRunEventsPublisher, KaliRunProcessor],
})
export class AppModule {}
