import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { CorrelationModule } from '@autoscanner/correlation';
import { PrismaModule } from '@autoscanner/database';
import { ParsersModule } from '@autoscanner/parsers';
import { StorageModule } from '@autoscanner/storage';
import { EngagementEventsModule } from '@autoscanner/engagement-events';
import { MessagingModule } from '@autoscanner/messaging';
import { AssetClient, DiscoveryClient } from '@autoscanner/service-clients';

import { ParseJobProcessor } from './parse-job.processor';
import { WebhookProcessor } from './webhook/webhook.processor';
import { FindingPersister } from './persisters/finding-persister';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    CorrelationModule,
    PrismaModule,
    StorageModule,
    ParsersModule,
    EngagementEventsModule.forRoot(),
    MessagingModule.forRoot(),
  ],
  providers: [AssetClient, DiscoveryClient, ParseJobProcessor, WebhookProcessor, FindingPersister],
})
export class AppModule {}
