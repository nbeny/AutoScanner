import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { ParsersModule } from '@autoscanner/parsers';
import { StorageModule } from '@autoscanner/storage';
import { EngagementEventsModule } from '@autoscanner/engagement-events';
import { MessagingModule } from '@autoscanner/messaging';
import { AssetClient, DiscoveryClient, FindingClient } from '@autoscanner/service-clients';

import { ParseJobProcessor } from './parse-job.processor';
import { WebhookProcessor } from './webhook/webhook.processor';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    StorageModule,
    ParsersModule,
    EngagementEventsModule.forRoot(),
    MessagingModule.forRoot(),
  ],
  providers: [AssetClient, DiscoveryClient, FindingClient, ParseJobProcessor, WebhookProcessor],
})
export class AppModule {}
