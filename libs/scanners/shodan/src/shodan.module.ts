import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { ShodanScanner } from './shodan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class ShodanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(ShodanScanner.name)) {
      this.registry.register(ShodanScanner);
    }
  }
}
