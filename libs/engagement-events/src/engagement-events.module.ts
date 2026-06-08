import { DynamicModule, Module, Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';

import {
  ENGAGEMENT_EVENTS_PUBLISHER,
  ENGAGEMENT_EVENTS_REDIS_CLIENT,
  IoredisEngagementEventsPublisher,
} from './engagement-events-publisher';

@Module({})
export class EngagementEventsModule {
  static forRoot(): DynamicModule {
    const redisClient: Provider = {
      provide: ENGAGEMENT_EVENTS_REDIS_CLIENT,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
    };
    const publisher: Provider = {
      provide: ENGAGEMENT_EVENTS_PUBLISHER,
      useClass: IoredisEngagementEventsPublisher,
    };
    return {
      module: EngagementEventsModule,
      imports: [AppConfigModule],
      providers: [redisClient, publisher],
      exports: [ENGAGEMENT_EVENTS_PUBLISHER, ENGAGEMENT_EVENTS_REDIS_CLIENT],
    };
  }
}
