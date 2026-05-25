import { Global, Module } from '@nestjs/common';
import { ScannerRegistry } from './registry';

@Global()
@Module({
  providers: [ScannerRegistry],
  exports: [ScannerRegistry],
})
export class ScannerSdkModule {}
