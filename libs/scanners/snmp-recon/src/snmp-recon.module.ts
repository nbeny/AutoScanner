import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SnmpReconScanner } from './snmp-recon.scanner';

@Module({ imports: [ScannerSdkModule] })
export class SnmpReconScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SnmpReconScanner.name)) {
      this.registry.register(SnmpReconScanner);
    }
  }
}
