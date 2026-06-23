import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { MapcidrScanner } from './mapcidr.scanner';

@Module({ imports: [ScannerSdkModule] })
export class MapcidrScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(MapcidrScanner.name)) {
      this.registry.register(MapcidrScanner);
    }
  }
}
