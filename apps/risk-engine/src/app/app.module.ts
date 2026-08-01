import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { MessagingModule } from '@autoscanner/messaging';

import { RiskController } from './risk.controller';
import { RiskService } from './risk.service';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, MessagingModule.forRoot()],
  controllers: [RiskController],
  providers: [RiskService],
})
export class AppModule {}
