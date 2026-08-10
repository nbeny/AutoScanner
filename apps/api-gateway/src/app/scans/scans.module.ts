import { Module } from '@nestjs/common';
import IORedis from 'ioredis';

import { AppConfigModule, AppConfigService } from '@autoscanner/config';
import { CapabilityModule } from '@autoscanner/auth';
import { LogStreamModule } from '@autoscanner/log-stream';
import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AllScannersModule } from '@autoscanner/scanners-all';
import { EngagementEventsModule } from '@autoscanner/engagement-events';

import { AuthModule } from '../auth/auth.module';
import { ScansController } from './scans.controller';
import { ScanJobFieldResolver, ScansResolver } from './scans.resolver';
import { ScansService } from './scans.service';
import { ScanControlPublisher, SCAN_CONTROL_REDIS } from './scan-control.publisher';
import { PreviewScanCommandService } from './preview-scan-command.service';

import './dto/scan-status.enum';
import './dto/scan-log-chunk.object';

@Module({
  imports: [
    AuthModule,
    AppConfigModule,
    LogStreamModule,
    ScannerSdkModule,
    AllScannersModule,
    EngagementEventsModule.forRoot(),
    CapabilityModule,
  ],
  controllers: [ScansController],
  providers: [
    ScansService,
    PreviewScanCommandService,
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
