import { Module } from '@nestjs/common';
import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { HealthModule } from './health/health.module';

@Module({
  imports: [AppConfigModule, AppLoggingModule, PrismaModule, HealthModule],
})
export class AppModule {}
