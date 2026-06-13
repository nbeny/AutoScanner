import { Module } from '@nestjs/common';

import { ScannerSdkModule } from '@autoscanner/scanner-sdk';
import { NmapScannerModule } from '@autoscanner/scanners-nmap';
import { SubfinderScannerModule } from '@autoscanner/scanners-subfinder';
import { HttpxScannerModule } from '@autoscanner/scanners-httpx';
import { DnsxScannerModule } from '@autoscanner/scanners-dnsx';
import { NaabuScannerModule } from '@autoscanner/scanners-naabu';
import { NucleiScannerModule } from '@autoscanner/scanners-nuclei';
import { FindomainScannerModule } from '@autoscanner/scanners-findomain';
import { AmassScannerModule } from '@autoscanner/scanners-amass';
import { AssetfinderScannerModule } from '@autoscanner/scanners-assetfinder';
import { PurednsScannerModule } from '@autoscanner/scanners-puredns';
import { KatanaScannerModule } from '@autoscanner/scanners-katana';
import { GauScannerModule } from '@autoscanner/scanners-gau';
import { FfufScannerModule } from '@autoscanner/scanners-ffuf';
import { WhoisScannerModule } from '@autoscanner/scanners-whois';
import { CrtshScannerModule } from '@autoscanner/scanners-crtsh';
import { ShodanScannerModule } from '@autoscanner/scanners-shodan';
import { TlsxScannerModule } from '@autoscanner/scanners-tlsx';
import { WhatwebScannerModule } from '@autoscanner/scanners-whatweb';
import { TheHarvesterScannerModule } from '@autoscanner/scanners-theharvester';

/**
 * Single import that registers every concrete scanner in the per-process
 * `ScannerRegistry`. Imported by api-gateway (ScansModule), scan-worker, and
 * orchestrator-worker so a scanner is runnable standalone AND in a template
 * without each app maintaining its own scanner import list.
 *
 * Each scanner module guards its `registry.register` with `has()` so importing
 * this module is idempotent across module re-inits (tests, hot reload).
 */
const SCANNER_MODULES = [
  NmapScannerModule,
  SubfinderScannerModule,
  HttpxScannerModule,
  DnsxScannerModule,
  NaabuScannerModule,
  NucleiScannerModule,
  FindomainScannerModule,
  AmassScannerModule,
  AssetfinderScannerModule,
  PurednsScannerModule,
  KatanaScannerModule,
  GauScannerModule,
  FfufScannerModule,
  WhoisScannerModule,
  CrtshScannerModule,
  ShodanScannerModule,
  TlsxScannerModule,
  WhatwebScannerModule,
  TheHarvesterScannerModule,
];

@Module({
  imports: [ScannerSdkModule, ...SCANNER_MODULES],
  exports: [...SCANNER_MODULES],
})
export class AllScannersModule {}
