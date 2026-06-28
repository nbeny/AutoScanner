import { Module } from '@nestjs/common';
import { AwsCredentialsService } from './aws/aws-credentials.service';
import { AzureCredentialsService } from './azure/azure-credentials.service';
import { GcpCredentialsService } from './gcp/gcp-credentials.service';

@Module({
  providers: [AwsCredentialsService, AzureCredentialsService, GcpCredentialsService],
  exports: [AwsCredentialsService, AzureCredentialsService, GcpCredentialsService],
})
export class CloudCredentialsModule {}
