import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { IkeScanScanner } from './ike-scan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class IkeScanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(IkeScanScanner.name)) {
      this.registry.register(IkeScanScanner);
    }
  }
}
