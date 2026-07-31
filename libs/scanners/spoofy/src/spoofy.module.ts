import { Module } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SpoofyScanner } from './spoofy.scanner';

@Module({
  imports: [ScannerSdkModule],
})
export class SpoofyScannerModule {
  constructor(registry: ScannerRegistry) {
    if (!registry.has('spoofy')) {
      registry.register(SpoofyScanner);
    }
  }
}
