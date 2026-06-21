import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { RdpSecCheckScanner } from './rdp-sec-check.scanner';

@Module({ imports: [ScannerSdkModule] })
export class RdpSecCheckScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(RdpSecCheckScanner.name)) this.registry.register(RdpSecCheckScanner);
  }
}
