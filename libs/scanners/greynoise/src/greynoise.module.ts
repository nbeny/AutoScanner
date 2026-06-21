import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { GreynoiseScanner } from './greynoise.scanner';

@Module({ imports: [ScannerSdkModule] })
export class GreynoiseScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}
  onModuleInit(): void {
    if (!this.registry.has(GreynoiseScanner.name)) this.registry.register(GreynoiseScanner);
  }
}
