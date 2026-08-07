import { Inject, Injectable } from '@nestjs/common';

import { KaliToolDetailObject, KaliToolSummaryObject } from './dto/kali-tool.object';
import type { KaliToolRecord } from './kali/types';

/** DI token for the loaded, immutable Kali dataset. */
export const KALI_DATASET = Symbol('KALI_DATASET');

@Injectable()
export class KaliCatalogService {
  constructor(@Inject(KALI_DATASET) private readonly records: KaliToolRecord[]) {}

  list(): KaliToolSummaryObject[] {
    return this.records
      .map((r) => this.toSummary(r))
      .sort((a, b) => a.binary.localeCompare(b.binary));
  }

  detail(binary: string): KaliToolDetailObject | null {
    const r = this.findByBinary(binary);
    if (!r) return null;
    return {
      ...this.toSummary(r),
      homepage: r.homepage,
      helpTextRaw: r.helpTextRaw,
      options: r.options,
      parseConfidence: r.parseConfidence,
      manAvailable: r.manAvailable,
      kaliRelease: r.kaliRelease,
      capturedAt: r.capturedAt,
    };
  }

  findByBinary(binary: string): KaliToolRecord | null {
    return this.records.find((r) => r.binary === binary) ?? null;
  }

  private toSummary(r: KaliToolRecord): KaliToolSummaryObject {
    return {
      binary: r.binary,
      package: r.package,
      displayName: r.displayName,
      description: r.description,
      categories: r.categories,
      hasHelp: r.helpTextRaw != null,
      optionCount: r.options.length,
    };
  }
}
