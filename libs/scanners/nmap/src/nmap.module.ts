import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { NmapScanner } from './nmap.scanner';

@Module({
  imports: [ScannerSdkModule],
})
export class NmapScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(NmapScanner.name)) {
      this.registry.register(NmapScanner);
    }
  }
}
