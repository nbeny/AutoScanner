import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { LinkfinderScanner } from './linkfinder.scanner';

@Module({ imports: [ScannerSdkModule] })
export class LinkfinderScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(LinkfinderScanner.name)) {
      this.registry.register(LinkfinderScanner);
    }
  }
}
