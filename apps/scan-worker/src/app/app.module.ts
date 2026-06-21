import { Module, type Provider } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { DockerRunnerModule } from '@autoscanner/docker-runner';
import { LogStreamModule } from '@autoscanner/log-stream';
import { QueueName, QueuesModule } from '@autoscanner/queues';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { StorageModule } from '@autoscanner/storage';
import { AllScannersModule } from '@autoscanner/scanners-all';

import { ScanJobProcessor } from './scan-job.processor';
import { secretBoxProvider } from './secret-box.provider';
import { ScanControlSubscriber, SCAN_CONTROL_SUB_REDIS } from './scan-control.subscriber';

const scanControlSubRedisProvider: Provider = {
  provide: SCAN_CONTROL_SUB_REDIS,
  inject: [AppConfigService],
  useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
};

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    QueuesModule,
    DockerRunnerModule,
    StorageModule,
    LogStreamModule,
    ScannerSdkModule,
    AllScannersModule,
    BullModule.registerQueue({ name: QueueName.PARSE_JOBS }),
  ],
  providers: [
    ScanJobProcessor,
    secretBoxProvider,
    scanControlSubRedisProvider,
    ScanControlSubscriber,
  ],
})
export class AppModule {}
