import { Inject, Injectable } from '@nestjs/common';
import { describeScannerInput, primaryCategoryOf, ScannerRegistry } from '@autoscanner/scanner-sdk';

import { ScannerCatalogEntryObject } from './dto/scanner-catalog.object';
import { KaliCatalogService } from './kali-catalog.service';
import { SCANNER_KALI_OVERRIDES } from './kali/scanner-kali-map';

/**
 * Exposes the live scanner registry (~120 scanners) and each scanner's option
 * fields (from its Zod inputSchema). Also resolves a `kaliToolRef` linking a
 * scanner to its underlying Kali binary (override map first, else a dataset
 * match on the scanner name, else null). Registry-only; no DB, no secrets.
 */
@Injectable()
export class ScannerCatalogService {
  constructor(
    @Inject(ScannerRegistry) private readonly registry: ScannerRegistry,
    private readonly kali: KaliCatalogService,
  ) {}

  catalog(): ScannerCatalogEntryObject[] {
    return this.registry
      .list()
      .map((scanner) => ({
        name: scanner.name,
        displayName: scanner.displayName,
        description: scanner.description,
        categories: scanner.category,
        primaryCategory: primaryCategoryOf(scanner),
        requiresCredential: scanner.requiresCredential ?? null,
        kaliToolRef: this.resolveKaliToolRef(scanner.name),
        fields: describeScannerInput(scanner.inputSchema),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  private resolveKaliToolRef(scannerName: string): string | null {
    const binary = SCANNER_KALI_OVERRIDES[scannerName] ?? scannerName;
    return this.kali.findByBinary(binary) ? binary : null;
  }
}
