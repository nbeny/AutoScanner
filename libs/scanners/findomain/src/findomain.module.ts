import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { FindomainScanner } from './findomain.scanner';

@Module({ imports: [ScannerSdkModule] })
export class FindomainScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(FindomainScanner.name)) {
      this.registry.register(FindomainScanner);
    }
  }
}
