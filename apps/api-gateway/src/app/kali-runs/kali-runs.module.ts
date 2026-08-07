import { Module } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';

import { AuthModule } from '../auth/auth.module';
import { ToolsModule } from '../tools/tools.module'; // exports KaliCatalogService
import { KaliRunsService } from './kali-runs.service';
import { KaliRunsResolver } from './kali-runs.resolver';
import {
  KaliToolRunEventsSubscriber,
  KALI_TOOL_RUN_EVENTS_SUBSCRIBER,
} from './kali-tool-run-events.subscriber';

@Module({
  imports: [AuthModule, AppConfigModule, ToolsModule],
  providers: [
    KaliRunsService,
    KaliRunsResolver,
    KaliToolRunEventsSubscriber,
    {
      provide: KALI_TOOL_RUN_EVENTS_SUBSCRIBER,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
    },
  ],
})
export class KaliRunsModule {}
