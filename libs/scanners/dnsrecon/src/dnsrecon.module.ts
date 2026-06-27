import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { DnsreconScanner } from './dnsrecon.scanner';

@Module({ imports: [ScannerSdkModule] })
export class DnsreconScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(DnsreconScanner.name)) {
      this.registry.register(DnsreconScanner);
    }
  }
}
