import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { QueuesModule } from '@autoscanner/queues';
import { StorageModule } from '@autoscanner/storage';
import { PDF_RENDERER, PuppeteerPdfRenderer } from '@autoscanner/reporting';
import { NotificationsFanoutModule } from '@autoscanner/notifications';

import { ReportProcessor } from './report.processor';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    QueuesModule,
    StorageModule,
    NotificationsFanoutModule,
  ],
  providers: [ReportProcessor, { provide: PDF_RENDERER, useClass: PuppeteerPdfRenderer }],
})
export class AppModule {}
