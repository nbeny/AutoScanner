import { Module, type Provider } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { DockerRunnerModule } from '@autoscanner/docker-runner';
import { LogStreamModule } from '@autoscanner/log-stream';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { StorageModule } from '@autoscanner/storage';
import { AllScannersModule } from '@autoscanner/scanners-all';
import { MessagingModule } from '@autoscanner/messaging';
import { ScanEventsModule } from '@autoscanner/scan-events';

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
    DockerRunnerModule,
    StorageModule,
    LogStreamModule,
    ScannerSdkModule,
    AllScannersModule,
    MessagingModule.forRoot(),
    ScanEventsModule.forRoot(),
  ],
  providers: [
    ScanJobProcessor,
    secretBoxProvider,
    scanControlSubRedisProvider,
    ScanControlSubscriber,
  ],
})
export class AppModule {}
