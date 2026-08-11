import { Module, type OnModuleInit } from '@nestjs/common';
import { ScannerRegistry, ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { buildKaliScanners } from './kali-scanner-factory';
import { loadKaliDataset } from './load-dataset';

/**
 * Registers one generic raw scanner per Kali dataset binary into the per-process
 * ScannerRegistry. Idempotent across module re-inits via `registry.has()`.
 */
@Module({ imports: [ScannerSdkModule] })
export class KaliGeneratedScannersModule implements OnModuleInit {
  constructor(private readonly registry: ScannerRegistry) {}

  onModuleInit(): void {
    for (const def of buildKaliScanners(loadKaliDataset())) {
      if (!this.registry.has(def.name)) {
        this.registry.register(def);
      }
    }
  }
}
