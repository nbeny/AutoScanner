import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { QueuesModule } from '@autoscanner/queues';
import { StorageModule } from '@autoscanner/storage';
import { PDF_RENDERER, PuppeteerPdfRenderer } from '@autoscanner/reporting';

import { ReportProcessor } from './report.processor';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, QueuesModule, StorageModule],
  providers: [ReportProcessor, { provide: PDF_RENDERER, useClass: PuppeteerPdfRenderer }],
})
export class AppModule {}
