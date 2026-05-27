import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { QueuesModule } from '@autoscanner/queues';
import { ParsersModule } from '@autoscanner/parsers';
import { StorageModule } from '@autoscanner/storage';

import { CorrelationService } from './correlation.service';
import { ParseJobProcessor } from './parse-job.processor';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    QueuesModule,
    StorageModule,
    ParsersModule,
  ],
  providers: [ParseJobProcessor, CorrelationService],
})
export class AppModule {}
