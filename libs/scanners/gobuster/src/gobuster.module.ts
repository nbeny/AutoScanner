import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GobusterScanner } from './gobuster.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GobusterScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(GobusterScanner.name)) {
      this.registry.register(GobusterScanner);
    }
  }
}
