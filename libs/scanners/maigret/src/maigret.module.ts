import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { MaigretScanner } from './maigret.scanner';

@Module({ imports: [ScannerSdkModule] })
export class MaigretScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(MaigretScanner.name)) {
      this.registry.register(MaigretScanner);
    }
  }
}
