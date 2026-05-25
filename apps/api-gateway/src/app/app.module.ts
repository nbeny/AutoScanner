import { Module } from '@nestjs/common';
import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule],
})
export class AppModule {}
