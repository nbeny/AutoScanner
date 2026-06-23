import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { HoleheScanner } from './holehe.scanner';

@Module({ imports: [ScannerSdkModule] })
export class HoleheScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(HoleheScanner.name)) {
      this.registry.register(HoleheScanner);
    }
  }
}
