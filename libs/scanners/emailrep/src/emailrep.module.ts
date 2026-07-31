import { Module } from '@nestjs/common';
import { ScannerSdkModule, ScannerRegistry } from '@autoscanner/scanner-sdk';
import { EmailrepScanner } from './emailrep.scanner';

@Module({
  imports: [ScannerSdkModule],
})
export class EmailrepScannerModule {
  constructor(registry: ScannerRegistry) {
    if (!registry.has('emailrep')) {
      registry.register(EmailrepScanner);
    }
  }
}
