import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadKaliDataset } from '../load-dataset';

describe('loadKaliDataset', () => {
  it('returns [] when the file is missing (API must still boot)', () => {
    expect(loadKaliDataset(join(tmpdir(), 'does-not-exist-kali.json'))).toEqual([]);
  });

  it('reads and parses a dataset file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kali-'));
    const file = join(dir, 'kali-tools.json');
    writeFileSync(file, JSON.stringify([{ package: 'nmap', binary: 'nmap', displayName: 'nmap' }]));
    try {
      const rows = loadKaliDataset(file);
      expect(rows).toHaveLength(1);
      expect(rows[0].binary).toBe('nmap');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
