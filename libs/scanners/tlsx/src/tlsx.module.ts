import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { TlsxScanner } from './tlsx.scanner';

@Module({
  imports: [ScannerSdkModule],
})
export class TlsxScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(TlsxScanner.name)) {
      this.registry.register(TlsxScanner);
    }
  }
}
