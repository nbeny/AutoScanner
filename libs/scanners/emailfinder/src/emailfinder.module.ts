import { Module } from '@nestjs/common';
import { ScannerSdkModule, type ScannerRegistry } from '@autoscanner/scanner-sdk';
import { EmailfinderScanner } from './emailfinder.scanner';

@Module({
  imports: [ScannerSdkModule],
})
export class EmailfinderScannerModule {
  constructor(registry: ScannerRegistry) {
    if (!registry.has('emailfinder')) {
      registry.register(EmailfinderScanner);
    }
  }
}
