// apps/api-gateway/src/app/tools/kali/normalize.ts
import { parseHelpOptions } from './parse-help';
import { parseManOptions } from './parse-man';
import type { KaliToolOption, KaliToolRecord, ParseConfidence, RawCapture } from './types';

export function normalizeRecord(
  raw: RawCapture,
  kaliRelease: string,
  capturedAt: string,
): KaliToolRecord {
  const help = raw.helpTextRaw
    ? parseHelpOptions(raw.helpTextRaw)
    : { options: [] as KaliToolOption[], confidence: 'none' as ParseConfidence };

  let options = help.options;
  let confidence = help.confidence;
  let optionsSource: 'help' | 'man' | 'none' = help.options.length ? 'help' : 'none';

  // Repli sur le man si le help est pauvre et qu'un man plus riche existe.
  if ((confidence === 'none' || confidence === 'low') && raw.manTextRaw) {
    const man = parseManOptions(raw.manTextRaw);
    if (man.options.length > options.length) {
      options = man.options;
      confidence = man.confidence;
      optionsSource = 'man';
    }
  }

  return {
    package: raw.package,
    binary: raw.binary,
    displayName: raw.binary,
    description: raw.description ?? '',
    homepage: raw.homepage ?? null,
    categories: raw.categories ?? [],
    helpTextRaw: raw.helpTextRaw ?? null,
    manTextRaw: raw.manTextRaw ?? null,
    options,
    parseConfidence: confidence,
    optionsSource,
    manAvailable: raw.manAvailable ?? false,
    source: 'kali-docker',
    kaliRelease,
    capturedAt,
  };
}
