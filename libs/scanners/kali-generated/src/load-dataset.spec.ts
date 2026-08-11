import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadKaliDataset } from './load-dataset';

describe('loadKaliDataset', () => {
  it('returns [] when the file is missing', () => {
    expect(loadKaliDataset(join(tmpdir(), 'does-not-exist-xyz.json'))).toEqual([]);
  });

  it('reads an array of records', () => {
    const dir = mkdtempSync(join(tmpdir(), 'kali-ds-'));
    const path = join(dir, 'kali-tools.json');
    writeFileSync(
      path,
      JSON.stringify([
        {
          package: 'nmap',
          binary: 'nmap',
          displayName: 'nmap',
          description: 'Network mapper',
          categories: ['information-gathering'],
          kaliRelease: '2025.1',
        },
      ]),
    );
    const rows = loadKaliDataset(path);
    expect(rows).toHaveLength(1);
    expect(rows[0].binary).toBe('nmap');
  });
});
