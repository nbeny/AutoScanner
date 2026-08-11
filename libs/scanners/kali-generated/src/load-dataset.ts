import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { KaliToolRecord } from './types';

/** Resolve the committed dataset path from the env override or the repo root. */
export function defaultKaliDatasetPath(): string {
  return process.env['KALI_TOOLS_DATASET'] ?? join(process.cwd(), 'data', 'kali-tools.json');
}

/** Default committed dataset path, resolved from the repo root at import time. */
export const DEFAULT_KALI_DATASET_PATH = defaultKaliDatasetPath();

/**
 * Reads the committed Kali dataset. Returns [] when the file is missing or
 * unreadable so every process boots even before the offline generator has run.
 * The path is resolved at call time so `KALI_TOOLS_DATASET` set after import
 * (e.g. by tests) is honored.
 */
export function loadKaliDataset(path: string = defaultKaliDatasetPath()): KaliToolRecord[] {
  try {
    if (!existsSync(path)) return [];
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as KaliToolRecord[]) : [];
  } catch {
    return [];
  }
}
