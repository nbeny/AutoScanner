import { Inject, Injectable } from '@nestjs/common';
import { describeScannerInput, ScannerRegistry } from '@autoscanner/scanner-sdk';

import { ScannerCatalogEntryObject } from './dto/scanner-catalog.object';

/**
 * Exposes the live scanner registry (all registered scanners, ~120) and each
 * scanner's option fields — derived from its Zod `inputSchema` — so the
 * frontend can render a per-tool run form. Registry-only; no DB, no secrets.
 */
@Injectable()
export class ScannerCatalogService {
  constructor(@Inject(ScannerRegistry) private readonly registry: ScannerRegistry) {}

  catalog(): ScannerCatalogEntryObject[] {
    return this.registry
      .list()
      .map((scanner) => ({
        name: scanner.name,
        displayName: scanner.displayName,
        description: scanner.description,
        categories: scanner.category,
        requiresCredential: scanner.requiresCredential ?? null,
        fields: describeScannerInput(scanner.inputSchema),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }
}
