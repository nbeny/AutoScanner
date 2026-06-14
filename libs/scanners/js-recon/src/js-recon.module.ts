import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { JsReconScanner } from './js-recon.scanner';

@Module({ imports: [ScannerSdkModule] })
export class JsReconScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(JsReconScanner.name)) {
      this.registry.register(JsReconScanner);
    }
  }
}
