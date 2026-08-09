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

const base = (over: Partial<RawCapture>): RawCapture => ({
  package: 'p',
  binary: 'b',
  description: '',
  homepage: null,
  categories: ['x'],
  helpTextRaw: null,
  manAvailable: false,
  ...over,
});

describe('normalizeRecord — précédence help/man', () => {
  it('utilise le help quand il donne des options', () => {
    const rec = normalizeRecord(
      base({ helpTextRaw: '  -a   do A\n  -b   do B\n  -c   do C' }),
      '2026.08',
      'T',
    );
    expect(rec.optionsSource).toBe('help');
    expect(rec.parseConfidence).toBe('high');
  });

  it('bascule sur le man quand le help ne donne rien mais le man oui', () => {
    const man = [
      'OPTIONS',
      '       -x',
      '              do X',
      '       -y',
      '              do Y',
      '       -z',
      '              do Z',
    ].join('\n');
    const rec = normalizeRecord(
      base({ helpTextRaw: 'usage: b <file>', manTextRaw: man }),
      '2026.08',
      'T',
    );
    expect(rec.optionsSource).toBe('man');
    expect(rec.options.map((o) => o.flag)).toEqual(['-x', '-y', '-z']);
    expect(rec.manTextRaw).toBe(man);
  });

  it('optionsSource none quand aucune source ne donne d’options', () => {
    const rec = normalizeRecord(base({ helpTextRaw: 'usage: b <file>' }), '2026.08', 'T');
    expect(rec.optionsSource).toBe('none');
    expect(rec.options).toHaveLength(0);
  });
});
