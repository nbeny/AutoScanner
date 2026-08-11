import { Module } from '@nestjs/common';

import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { KaliGeneratedScannersModule } from '@autoscanner/scanners-kali-generated';

/**
 * Single import that registers every runnable scanner in the per-process
 * `ScannerRegistry`. As of the Kali-as-scanner pivot (SP1), the registered set
 * is the generated Kali tool catalog (raw output, no findings) — the former
 * structured per-tool scanners are no longer registered. Imported by
 * api-gateway (ScansModule), scan-worker, and orchestrator-worker so a scanner
 * is runnable standalone AND in a template.
 */
@Module({
  imports: [ScannerSdkModule, KaliGeneratedScannersModule],
  exports: [KaliGeneratedScannersModule],
})
export class AllScannersModule {}
