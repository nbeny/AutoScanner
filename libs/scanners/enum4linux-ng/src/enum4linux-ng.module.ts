import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { Enum4LinuxNgScanner } from './enum4linux-ng.scanner';

@Module({ imports: [ScannerSdkModule] })
export class Enum4LinuxNgScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(Enum4LinuxNgScanner.name)) {
      this.registry.register(Enum4LinuxNgScanner);
    }
  }
}
