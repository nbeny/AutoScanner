import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { NucleiScanner } from './nuclei.scanner';

@Module({
  imports: [ScannerSdkModule],
})
export class NucleiScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(NucleiScanner.name)) {
      this.registry.register(NucleiScanner);
    }
  }
}
