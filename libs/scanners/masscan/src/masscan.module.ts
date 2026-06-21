import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { MasscanScanner } from './masscan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class MasscanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(MasscanScanner.name)) {
      this.registry.register(MasscanScanner);
    }
  }
}
