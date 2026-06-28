import { Module } from '@nestjs/common';
import { SecretBox } from '@autoscanner/common';
import { AppConfigService } from '@autoscanner/config';
import {
  AwsCredentialsService,
  AzureCredentialsService,
  GcpCredentialsService,
  CloudCredentialsModule as CoreModule,
  SECRET_BOX,
} from '@autoscanner/cloud-credentials';
import { AuthModule } from '../auth/auth.module';
import { CloudCredentialsResolver } from './cloud-credentials.resolver';

@Module({
  imports: [AuthModule, CoreModule],
  providers: [
    CloudCredentialsResolver,
    AwsCredentialsService,
    AzureCredentialsService,
    GcpCredentialsService,
    {
      provide: SECRET_BOX,
      inject: [AppConfigService],
      useFactory: (cfg: AppConfigService) => new SecretBox(cfg.env.MASTER_ENCRYPTION_KEY),
    },
  ],
})
export class CloudCredentialsApiModule {}
