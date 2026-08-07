import { Module } from '@nestjs/common';

import { AppConfigModule } from '@autoscanner/config';
import { AppLoggingModule } from '@autoscanner/logging';
import { PrismaModule } from '@autoscanner/database';
import { DockerRunnerModule } from '@autoscanner/docker-runner';
import { StorageModule } from '@autoscanner/storage';
import { MessagingModule } from '@autoscanner/messaging';

@Module({
  imports: [
    AppConfigModule,
    AppLoggingModule,
    PrismaModule,
    DockerRunnerModule,
    StorageModule,
    MessagingModule.forRoot(),
  ],
  providers: [],
})
export class AppModule {}
