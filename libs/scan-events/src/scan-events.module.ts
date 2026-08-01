import { DynamicModule, Module, type Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';

import { ScanJobDonePublisher } from './scan-job-done.publisher';
import { SCAN_JOB_DONE_REDIS_CLIENT } from './tokens';

const redisClient: Provider = {
  provide: SCAN_JOB_DONE_REDIS_CLIENT,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
};

/**
 * Provides {@link ScanJobDonePublisher} over a dedicated ioredis connection. Imported by the
 * producer (scan-worker). Subscribers keep their own Redis subscriber clients.
 */
@Module({})
export class ScanEventsModule {
  static forRoot(): DynamicModule {
    return {
      module: ScanEventsModule,
      imports: [AppConfigModule],
      providers: [redisClient, ScanJobDonePublisher],
      exports: [ScanJobDonePublisher],
    };
  }
}
