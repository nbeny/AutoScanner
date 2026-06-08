import { Module, Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { PrismaModule } from '@autoscanner/database';

import {
  ENGAGEMENT_EVENTS_SUBSCRIBE_CLIENT,
  EngagementEventsSubscriberService,
} from './engagement-events-subscriber.service';

const subscribeClient: Provider = {
  provide: ENGAGEMENT_EVENTS_SUBSCRIBE_CLIENT,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
};

@Module({
  imports: [AppConfigModule, PrismaModule],
  providers: [subscribeClient, EngagementEventsSubscriberService],
  exports: [EngagementEventsSubscriberService],
})
export class EngagementEventsModule {}
