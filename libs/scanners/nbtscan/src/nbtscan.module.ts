import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { NbtscanScanner } from './nbtscan.scanner';

@Module({ imports: [ScannerSdkModule] })
export class NbtscanScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(NbtscanScanner.name)) this.registry.register(NbtscanScanner);
  }
}
