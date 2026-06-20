import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { KerbruteScanner } from './kerbrute.scanner';

@Module({ imports: [ScannerSdkModule] })
export class KerbruteScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(KerbruteScanner.name)) {
      this.registry.register(KerbruteScanner);
    }
  }
}
