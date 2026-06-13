import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { WhatwwebScanner } from './whatweb.scanner';

@Module({ imports: [ScannerSdkModule] })
export class WhatwwebScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(WhatwwebScanner.name)) {
      this.registry.register(WhatwwebScanner);
    }
  }
}
