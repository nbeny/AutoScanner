import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { NvdClient, TokenBucketRateLimiter } from '@autoscanner/cve';
import { PrismaModule } from '@autoscanner/database';
import { QueuesModule } from '@autoscanner/queues';

import { NvdSyncProcessor } from './nvd-sync.processor';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, QueuesModule],
  providers: [
    NvdSyncProcessor,
    {
      provide: NvdClient,
      useFactory: () => {
        const apiKey = process.env.NVD_API_KEY || undefined;
        const capacity = apiKey ? 50 : 5;
        if (!apiKey) {
          // eslint-disable-next-line no-console
          console.warn('[nvd-sync-worker] NVD_API_KEY not set: limiting to 5 req / 30s');
        }
        return new NvdClient({
          apiKey,
          rateLimiter: new TokenBucketRateLimiter({ capacity, refillIntervalMs: 30_000 }),
        });
      },
    },
  ],
})
export class AppModule {}
