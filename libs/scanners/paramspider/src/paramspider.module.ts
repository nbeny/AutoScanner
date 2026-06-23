import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { ParamspiderScanner } from './paramspider.scanner';

@Module({ imports: [ScannerSdkModule] })
export class ParamspiderScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(ParamspiderScanner.name)) {
      this.registry.register(ParamspiderScanner);
    }
  }
}
