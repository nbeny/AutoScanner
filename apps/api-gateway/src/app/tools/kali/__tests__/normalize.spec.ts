// apps/api-gateway/src/app/tools/kali/__tests__/normalize.spec.ts
import { normalizeRecord } from '../normalize';
import type { RawCapture } from '../types';

const META = { kaliRelease: '2026.1', capturedAt: '2026-08-07T00:00:00.000Z' };

function raw(over: Partial<RawCapture> = {}): RawCapture {
  return {
    package: 'nmap',
    binary: 'nmap',
    description: 'The Network Mapper',
    homepage: 'https://nmap.org',
    categories: ['information-gathering'],
    helpTextRaw: null,
    manAvailable: false,
    ...over,
  };
}

describe('normalizeRecord', () => {
  it('parses options from help and stamps provenance', () => {
    const rec = normalizeRecord(
      raw({ helpTextRaw: '  -sV                   Probe service/version' }),
      META.kaliRelease,
      META.capturedAt,
    );
    expect(rec.binary).toBe('nmap');
    expect(rec.displayName).toBe('nmap');
    expect(rec.source).toBe('kali-docker');
    expect(rec.kaliRelease).toBe('2026.1');
    expect(rec.capturedAt).toBe(META.capturedAt);
    expect(rec.options).toEqual([
      { flag: '-sV', argHint: null, description: 'Probe service/version' },
    ]);
    expect(rec.parseConfidence).toBe('low');
  });

  it('handles a help-less binary (no options, confidence none)', () => {
    const rec = normalizeRecord(raw({ helpTextRaw: null }), META.kaliRelease, META.capturedAt);
    expect(rec.helpTextRaw).toBeNull();
    expect(rec.options).toEqual([]);
    expect(rec.parseConfidence).toBe('none');
  });
});
