import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { AssetfinderScanner } from './assetfinder.scanner';

@Module({ imports: [ScannerSdkModule] })
export class AssetfinderScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(AssetfinderScanner.name)) {
      this.registry.register(AssetfinderScanner);
    }
  }
}
