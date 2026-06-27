import { OsintPassiveDeep } from '../osint-passive-deep';

describe('OsintPassiveDeep enrichment', () => {
  it('contains every pre-existing step (no removals)', () => {
    const names = OsintPassiveDeep.steps.map((s) => s.scannerName);
    for (const required of [
      'asnmap',
      'cloud-enum',
      'github-subdomains',
      'trufflehog',
      'securitytrails',
      'metabigor',
      'spiderfoot',
      'dnstwist',
    ]) {
      expect(names).toContain(required);
    }
  });

  it('inserts chaos right after subfinder (or, if absent, after github-subdomains seeding)', () => {
    const names = OsintPassiveDeep.steps.map((s) => s.scannerName);
    expect(names).toContain('chaos');
    const idxChaos = names.indexOf('chaos');
    const idxSec = names.indexOf('securitytrails');
    expect(idxChaos).toBeGreaterThan(-1);
    expect(idxChaos).toBeLessThan(idxSec);
  });

  it('inserts urlfinder after the seeding block (before dnstwist)', () => {
    const names = OsintPassiveDeep.steps.map((s) => s.scannerName);
    expect(names).toContain('urlfinder');
    const idxUrlfinder = names.indexOf('urlfinder');
    const idxDnstwist = names.indexOf('dnstwist');
    expect(idxUrlfinder).toBeGreaterThan(-1);
    expect(idxUrlfinder).toBeLessThan(idxDnstwist);
  });
});
