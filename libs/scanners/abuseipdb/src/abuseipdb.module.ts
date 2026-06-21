import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AbuseipdbScanner } from './abuseipdb.scanner';

@Module({ imports: [ScannerSdkModule] })
export class AbuseipdbScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(AbuseipdbScanner.name)) this.registry.register(AbuseipdbScanner);
  }
}
