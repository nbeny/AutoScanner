import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';

import { FindingController } from './finding.controller';
import { FindingPersister } from './persisters/finding-persister';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, MessagingModule.forRoot()],
  controllers: [FindingController],
  providers: [FindingPersister],
})
export class AppModule {}
