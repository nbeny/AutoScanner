import { normalizeRecord } from './normalize';
import type { KaliToolRecord, RawCapture } from './types';

/** Pure transform: raw JSONL text -> normalized dataset. */
export function rawLinesToDataset(
  jsonl: string,
  kaliRelease: string,
  capturedAt: string,
): KaliToolRecord[] {
  return jsonl
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => normalizeRecord(JSON.parse(l) as RawCapture, kaliRelease, capturedAt));
}
