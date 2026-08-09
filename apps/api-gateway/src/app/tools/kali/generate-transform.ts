import { normalizeRecord } from './normalize';
import type { KaliToolRecord, RawCapture } from './types';

/** Pure transform: raw JSONL text -> normalized, de-duplicated dataset. */
export function rawLinesToDataset(
  jsonl: string,
  kaliRelease: string,
  capturedAt: string,
): KaliToolRecord[] {
  const records = jsonl
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => normalizeRecord(JSON.parse(l) as RawCapture, kaliRelease, capturedAt));
  return mergeByBinary(records);
}

/**
 * A binary can be pulled in by several `kali-tools-*` metapackages, so capture
 * emits one record per (metapackage, binary). Collapse duplicates by binary:
 * union their categories and keep the help-bearing record's other fields.
 */
function mergeByBinary(records: KaliToolRecord[]): KaliToolRecord[] {
  const byBinary = new Map<string, KaliToolRecord>();
  for (const rec of records) {
    const existing = byBinary.get(rec.binary);
    if (!existing) {
      byBinary.set(rec.binary, { ...rec, categories: [...new Set(rec.categories)] });
      continue;
    }
    // Préférer le record le plus informatif : d'abord celui qui a des options, sinon celui avec du help.
    const recScore = (r: KaliToolRecord) => (r.options.length > 0 ? 2 : r.helpTextRaw ? 1 : 0);
    const base = recScore(rec) > recScore(existing) ? rec : existing;
    byBinary.set(rec.binary, {
      ...base,
      categories: [...new Set([...existing.categories, ...rec.categories])],
    });
  }
  return [...byBinary.values()];
}
