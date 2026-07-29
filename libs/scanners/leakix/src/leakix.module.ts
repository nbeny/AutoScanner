import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { LeakixScanner } from './leakix.scanner';

@Module({ imports: [ScannerSdkModule] })
export class LeakixScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(LeakixScanner.name)) {
      this.registry.register(LeakixScanner);
    }
  }
}
