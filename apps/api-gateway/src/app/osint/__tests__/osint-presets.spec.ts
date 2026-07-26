import { OSINT_PRESETS, OSINT_SEED_TYPES, emailLocalPart } from '../osint-presets';
import { OsintSeedTypeGql } from '../dto/run-osint-scan.input';

describe('OSINT presets', () => {
  it('covers every GraphQL seed-type enum value with a non-empty preset', () => {
    for (const key of Object.values(OsintSeedTypeGql)) {
      expect(OSINT_SEED_TYPES).toContain(key);
      expect(OSINT_PRESETS[key].length).toBeGreaterThan(0);
    }
  });

  it('only references known key-free OSINT scanner names', () => {
    const known = new Set([
      'holehe',
      'emailrep',
      'maigret',
      'spiderfoot',
      'theharvester',
      'emailfinder',
      'whois',
      'dnstwist',
      'mailspoof',
      'spoofy',
    ]);
    for (const steps of Object.values(OSINT_PRESETS)) {
      for (const step of steps) {
        expect(known.has(step.scanner)).toBe(true);
      }
    }
  });

  it('sends only maigret the email local-part', () => {
    const maigretStep = OSINT_PRESETS.EMAIL.find((s) => s.scanner === 'maigret');
    expect(maigretStep?.target?.('alice@corp.com')).toBe('alice');
    const holeheStep = OSINT_PRESETS.EMAIL.find((s) => s.scanner === 'holehe');
    expect(holeheStep?.target).toBeUndefined();
  });

  it('emailLocalPart passes through a bare username', () => {
    expect(emailLocalPart('neo')).toBe('neo');
    expect(emailLocalPart('a@b.com')).toBe('a');
  });
});
