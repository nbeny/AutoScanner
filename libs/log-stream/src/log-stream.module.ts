import { Global, Module, type Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';

import { RedisLogStreamPublisher, RedisLogStreamSubscriber } from './redis-log-stream';
import {
  LOG_STREAM_PUBLISHER,
  LOG_STREAM_SUBSCRIBER,
  REDIS_PUBLISHER_CLIENT,
  REDIS_SUBSCRIBER_CLIENT,
} from './tokens';

const publisherClient: Provider = {
  provide: REDIS_PUBLISHER_CLIENT,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
};

const subscriberClient: Provider = {
  provide: REDIS_SUBSCRIBER_CLIENT,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
};

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    publisherClient,
    subscriberClient,
    RedisLogStreamPublisher,
    RedisLogStreamSubscriber,
    { provide: LOG_STREAM_PUBLISHER, useExisting: RedisLogStreamPublisher },
    { provide: LOG_STREAM_SUBSCRIBER, useExisting: RedisLogStreamSubscriber },
  ],
  exports: [LOG_STREAM_PUBLISHER, LOG_STREAM_SUBSCRIBER],
})
export class LogStreamModule {}
