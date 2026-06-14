import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AsnmapScanner } from './asnmap.scanner';

@Module({ imports: [ScannerSdkModule] })
export class AsnmapScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(AsnmapScanner.name)) {
      this.registry.register(AsnmapScanner);
    }
  }
}
