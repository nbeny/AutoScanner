import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { WaymoreScanner } from './waymore.scanner';

@Module({ imports: [ScannerSdkModule] })
export class WaymoreScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(WaymoreScanner.name)) {
      this.registry.register(WaymoreScanner);
    }
  }
}
