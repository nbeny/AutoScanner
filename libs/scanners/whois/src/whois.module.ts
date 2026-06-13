import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { WhoisScanner } from './whois.scanner';

@Module({ imports: [ScannerSdkModule] })
export class WhoisScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(WhoisScanner.name)) {
      this.registry.register(WhoisScanner);
    }
  }
}
