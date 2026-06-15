import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SqliScanScanner } from './sqli-scan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SqliScanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SqliScanScanner.name)) {
      this.registry.register(SqliScanScanner);
    }
  }
}
