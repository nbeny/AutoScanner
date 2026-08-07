import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rawLinesToDataset } from '../generate-transform';

describe('rawLinesToDataset', () => {
  it('normalizes each raw JSONL line and stamps release/capturedAt', () => {
    const jsonl = readFileSync(join(__dirname, '__fixtures__/raw-sample.jsonl'), 'utf8');
    const ds = rawLinesToDataset(jsonl, '2026.1', '2026-08-07T00:00:00.000Z');
    expect(ds).toHaveLength(2);
    expect(ds[0]).toMatchObject({ binary: 'nmap', kaliRelease: '2026.1', source: 'kali-docker' });
    expect(ds[0].options).toEqual([
      { flag: '-sV', argHint: null, description: 'Probe service/version' },
    ]);
    expect(ds[1]).toMatchObject({ binary: 'nikto', parseConfidence: 'none', options: [] });
  });

  it('skips blank lines', () => {
    expect(rawLinesToDataset('\n\n', '2026.1', 't')).toEqual([]);
  });

  it('merges duplicate binaries: unions categories, prefers the help-bearing record', () => {
    // A binary shows up under several kali-tools-* metapackages -> capture emits
    // one line per (metapackage, binary). They must collapse to one record.
    const jsonl = [
      JSON.stringify({
        package: 'nmap',
        binary: 'nmap',
        description: 'Net mapper',
        homepage: 'https://nmap.org',
        categories: ['information-gathering'],
        helpTextRaw: null,
        manAvailable: true,
      }),
      JSON.stringify({
        package: 'nmap',
        binary: 'nmap',
        description: 'Net mapper',
        homepage: 'https://nmap.org',
        categories: ['vulnerability'],
        helpTextRaw: '  -sV   Probe',
        manAvailable: true,
      }),
    ].join('\n');
    const ds = rawLinesToDataset(jsonl, '2026.1', 't');
    expect(ds).toHaveLength(1);
    expect(ds[0].categories).toEqual(['information-gathering', 'vulnerability']);
    expect(ds[0].helpTextRaw).toBe('  -sV   Probe');
    expect(ds[0].options).toEqual([{ flag: '-sV', argHint: null, description: 'Probe' }]);
  });
});
