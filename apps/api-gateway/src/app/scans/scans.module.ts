import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { CapabilityModule } from '@autoscanner/auth';
import { LogStreamModule } from '@autoscanner/log-stream';
import { QueueName, QueuesModule } from '@autoscanner/queues';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';
import { EngagementEventsModule } from '@autoscanner/engagement-events';

import { AuthModule } from '../auth/auth.module';
import { ScansController } from './scans.controller';
import { ScanJobFieldResolver, ScansResolver } from './scans.resolver';
import { ScansService } from './scans.service';
import { ScanControlPublisher, SCAN_CONTROL_REDIS } from './scan-control.publisher';

import './dto/scan-status.enum';
import './dto/scan-log-chunk.object';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    QueuesModule,
    LogStreamModule,
    ScannerSdkModule,
    AllScannersModule,
    BullModule.registerQueue({ name: QueueName.SCAN_JOBS }),
    EngagementEventsModule.forRoot(),
    CapabilityModule,
  ],
  controllers: [ScansController],
  providers: [
    ScansService,
    ScansResolver,
    ScanJobFieldResolver,
    ScanControlPublisher,
    {
      provide: SCAN_CONTROL_REDIS,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => new IORedis(cfg.env.REDIS_URL, { lazyConnect: false }),
    },
  ],
  exports: [ScansService],
})
export class ScansModule {}
