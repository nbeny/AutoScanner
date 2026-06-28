import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { MsftreconScanner } from './msftrecon.scanner';

@Module({ imports: [ScannerSdkModule] })
export class MsftreconScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(MsftreconScanner.name)) {
      this.registry.register(MsftreconScanner);
    }
  }
}
