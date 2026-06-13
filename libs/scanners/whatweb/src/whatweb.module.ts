import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { WhatwebScanner } from './whatweb.scanner';

@Module({ imports: [ScannerSdkModule] })
export class WhatwebScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(WhatwebScanner.name)) {
      this.registry.register(WhatwebScanner);
    }
  }
}
