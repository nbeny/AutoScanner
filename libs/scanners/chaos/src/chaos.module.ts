import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { ChaosScanner } from './chaos.scanner';

@Module({ imports: [ScannerSdkModule] })
export class ChaosScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(ChaosScanner.name)) {
      this.registry.register(ChaosScanner);
    }
  }
}
