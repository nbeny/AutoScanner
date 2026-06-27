import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { OnesixtyoneScanner } from './onesixtyone.scanner';

@Module({ imports: [ScannerSdkModule] })
export class OnesixtyoneScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(OnesixtyoneScanner.name)) {
      this.registry.register(OnesixtyoneScanner);
    }
  }
}
