import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KaliToolRecord } from './types';

/** Default committed dataset path, resolved from the repo root at runtime. */
export const DEFAULT_KALI_DATASET_PATH =
  process.env['KALI_TOOLS_DATASET'] ?? join(process.cwd(), 'data', 'kali-tools.json');

/**
 * Reads the committed Kali dataset. Returns [] when the file is missing or
 * unreadable so every process boots even before the offline generator has run.
 */
export function loadKaliDataset(path: string = DEFAULT_KALI_DATASET_PATH): KaliToolRecord[] {
  try {
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as KaliToolRecord[]) : [];
  } catch {
    return [];
  }
}
