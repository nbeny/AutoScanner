import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { NaabuScanner } from './naabu.scanner';

@Module({
  imports: [ScannerSdkModule],
})
export class NaabuScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(NaabuScanner.name)) {
      this.registry.register(NaabuScanner);
    }
  }
}
