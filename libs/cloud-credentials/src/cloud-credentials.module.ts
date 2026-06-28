import { Module } from '@nestjs/common';
import { AwsCredentialsService } from './aws/aws-credentials.service';
import { AzureCredentialsService } from './azure/azure-credentials.service';

@Module({
  providers: [AwsCredentialsService, AzureCredentialsService],
  exports: [AwsCredentialsService, AzureCredentialsService],
})
export class CloudCredentialsModule {}
