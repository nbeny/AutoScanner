import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '@autoscanner/config';
import { S3ObjectStorage } from './s3-storage';
import { OBJECT_STORAGE } from './types';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [S3ObjectStorage, { provide: OBJECT_STORAGE, useExisting: S3ObjectStorage }],
  exports: [OBJECT_STORAGE, S3ObjectStorage],
})
export class StorageModule {}
