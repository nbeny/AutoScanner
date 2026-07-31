import { BullModule } from '@nestjs/bullmq';
import { Global, Module } from '@nestjs/common';
import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { DEFAULT_JOB_OPTIONS } from './bullmq.config';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [AppConfigModule],
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => ({
        connection: { url: cfg.env.REDIS_URL },
        defaultJobOptions: DEFAULT_JOB_OPTIONS,
      }),
    }),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
