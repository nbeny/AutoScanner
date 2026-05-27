import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { SubfinderScanner } from './subfinder.scanner';

@Module({
  imports: [ScannerSdkModule],
})
export class SubfinderScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(SubfinderScanner.name)) {
      this.registry.register(SubfinderScanner);
    }
  }
}
