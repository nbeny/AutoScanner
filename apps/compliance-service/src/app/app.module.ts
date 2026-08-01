import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';

import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { FindingCreatedConsumer } from './finding-created.consumer';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, MessagingModule.forRoot()],
  controllers: [ComplianceController],
  providers: [ComplianceService, FindingCreatedConsumer],
})
export class AppModule {}
