import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { PwncatScanner } from './pwncat.scanner';

@Module({ imports: [ScannerSdkModule] })
export class PwncatScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(PwncatScanner.name)) this.registry.register(PwncatScanner);
  }
}
