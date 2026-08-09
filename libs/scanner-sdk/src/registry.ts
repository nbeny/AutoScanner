import { Injectable, Logger } from '@nestjs/common';
import type { ScannerCategory, ScannerDefinition } from './types';
import { isOsintScanner } from './osint-categories';

@Injectable()
export class ScannerRegistry {
  private readonly logger = new Logger(ScannerRegistry.name);
  private readonly scanners = new Map<string, ScannerDefinition>();

  register(def: ScannerDefinition): void {
    if (this.scanners.has(def.name)) {
      throw new Error(`Scanner "${def.name}" is already registered`);
    }
    this.scanners.set(def.name, def);
    this.logger.log(`Registered scanner: ${def.name}`);
  }

  has(name: string): boolean {
    return this.scanners.has(name);
  }

  get(name: string): ScannerDefinition {
    const def = this.scanners.get(name);
    if (!def) {
      throw new Error(`Scanner "${name}" not found in registry`);
    }
    return def;
  }

  list(filter?: { category?: ScannerCategory }): ScannerDefinition[] {
    const all = Array.from(this.scanners.values());
    if (!filter?.category) return all;
    return all.filter((s) => s.category.includes(filter.category!));
  }

  /** Noms des scanners dont la catégorie primaire est OSINT. */
  osintScannerNames(): string[] {
    return Array.from(this.scanners.values())
      .filter((s) => isOsintScanner(s))
      .map((s) => s.name);
  }

  size(): number {
    return this.scanners.size;
  }
}
