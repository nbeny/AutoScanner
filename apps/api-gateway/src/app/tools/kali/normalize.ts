// apps/api-gateway/src/app/tools/kali/normalize.ts
import { parseHelpOptions } from './parse-help';
import type { KaliToolRecord, RawCapture } from './types';

export function normalizeRecord(
  raw: RawCapture,
  kaliRelease: string,
  capturedAt: string,
): KaliToolRecord {
  const parsed = raw.helpTextRaw
    ? parseHelpOptions(raw.helpTextRaw)
    : { options: [], confidence: 'none' as const };

  return {
    package: raw.package,
    binary: raw.binary,
    displayName: raw.binary,
    description: raw.description ?? '',
    homepage: raw.homepage ?? null,
    categories: raw.categories ?? [],
    helpTextRaw: raw.helpTextRaw ?? null,
    options: parsed.options,
    parseConfidence: parsed.confidence,
    manAvailable: raw.manAvailable ?? false,
    source: 'kali-docker',
    kaliRelease,
    capturedAt,
  };
}
