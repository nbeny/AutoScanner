import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { KubeHunterScanner } from './kube-hunter.scanner';

@Module({ imports: [ScannerSdkModule] })
export class KubeHunterScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(KubeHunterScanner.name)) {
      this.registry.register(KubeHunterScanner);
    }
  }
}
