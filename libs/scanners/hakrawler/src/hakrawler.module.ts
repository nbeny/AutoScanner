import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { HakrawlerScanner } from './hakrawler.scanner';

@Module({ imports: [ScannerSdkModule] })
export class HakrawlerScannerModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    if (!this.registry.has(HakrawlerScanner.name)) {
      this.registry.register(HakrawlerScanner);
    }
  }
}
