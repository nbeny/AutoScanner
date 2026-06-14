import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GowitnessScanner } from './gowitness.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GowitnessScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(GowitnessScanner.name)) {
      this.registry.register(GowitnessScanner);
    }
  }
}
