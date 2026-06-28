import { Module } from '@nestjs/common';
import { AwsCredentialsService } from './aws/aws-credentials.service';

@Module({
  providers: [AwsCredentialsService],
  exports: [AwsCredentialsService],
})
export class CloudCredentialsModule {}
