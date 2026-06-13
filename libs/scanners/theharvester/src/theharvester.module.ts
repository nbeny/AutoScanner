import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { TheHarvesterScanner } from './theharvester.scanner';

@Module({ imports: [ScannerSdkModule] })
export class TheHarvesterScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(TheHarvesterScanner.name)) {
      this.registry.register(TheHarvesterScanner);
    }
  }
}
