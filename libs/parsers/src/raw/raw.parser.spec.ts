import { RawParser } from './raw.parser';
import { emptyNormalizedOutput } from '../types';

describe('RawParser', () => {
  it('is named "raw" and handles TEXT', () => {
    const p = new RawParser();
    expect(p.name).toBe('raw');
    expect(p.formats).toContain('TEXT');
  });

  it('produces zero entities and zero findings', async () => {
    const out = await new RawParser().parse('anything at all', {
      scanJobId: 'j',
      scannerName: 'nmap',
      target: 'example.com',
      engagementId: 'e',
    });
    expect(out).toEqual(emptyNormalizedOutput());
    expect(out.findings).toHaveLength(0);
  });
});
