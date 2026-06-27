import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { JsluiceScanner } from './jsluice.scanner';

@Module({ imports: [ScannerSdkModule] })
export class JsluiceScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(JsluiceScanner.name)) {
      this.registry.register(JsluiceScanner);
    }
  }
}
