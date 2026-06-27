import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { UrlfinderScanner } from './urlfinder.scanner';

@Module({ imports: [ScannerSdkModule] })
export class UrlfinderScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(UrlfinderScanner.name)) {
      this.registry.register(UrlfinderScanner);
    }
  }
}
