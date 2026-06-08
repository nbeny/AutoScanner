import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { PrismaModule } from '@autoscanner/database';

@Module({
  imports: [AppConfigModule, PrismaModule],
  providers: [],
  exports: [],
})
export class EngagementEventsModule {}
