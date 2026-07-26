import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SocialscanScanner } from './socialscan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SocialscanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SocialscanScanner.name)) {
      this.registry.register(SocialscanScanner);
    }
  }
}
