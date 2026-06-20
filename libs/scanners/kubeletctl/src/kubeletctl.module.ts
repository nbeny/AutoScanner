import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { KubeletctlScanner } from './kubeletctl.scanner';

@Module({ imports: [ScannerSdkModule] })
export class KubeletctlScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(KubeletctlScanner.name)) {
      this.registry.register(KubeletctlScanner);
    }
  }
}
