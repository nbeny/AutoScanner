import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SpiderfootScanner } from './spiderfoot.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SpiderfootScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SpiderfootScanner.name)) {
      this.registry.register(SpiderfootScanner);
    }
  }
}
