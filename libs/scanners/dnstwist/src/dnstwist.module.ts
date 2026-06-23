import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { DnstwistScanner } from './dnstwist.scanner';

@Module({ imports: [ScannerSdkModule] })
export class DnstwistScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(DnstwistScanner.name)) {
      this.registry.register(DnstwistScanner);
    }
  }
}
