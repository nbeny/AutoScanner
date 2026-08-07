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
});
