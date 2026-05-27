import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { DnsxScanner } from './dnsx.scanner';

@Module({
  imports: [ScannerSdkModule],
})
export class DnsxScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(DnsxScanner.name)) {
      this.registry.register(DnsxScanner);
    }
  }
}
