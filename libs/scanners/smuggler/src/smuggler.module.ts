import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SmugglerScanner } from './smuggler.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SmugglerScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SmugglerScanner.name)) {
      this.registry.register(SmugglerScanner);
    }
  }
}
