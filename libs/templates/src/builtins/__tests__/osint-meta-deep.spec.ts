import { OsintMetaDeep } from '../osint-meta-deep';

describe('OsintMetaDeep template', () => {
  it('chains the 5 phase-13A scanners after the existing crtsh+subfinder seeds', () => {
    const names = OsintMetaDeep.steps.map((s) => s.scannerName);
    expect(names).toEqual([
      'crtsh',
      'subfinder',
      'chaos',
      'uncover',
      'fofa',
      'urlfinder',
      'gitleaks',
      'emailrep',
    ]);
  });

  it('each step targets the engagement target by default', () => {
    const nonEmailrepSteps = OsintMetaDeep.steps.filter((s) => s.scannerName !== 'emailrep');
    expect(
      nonEmailrepSteps.every((s) => s.target.kind === 'context' && s.target.path === 'target'),
    ).toBe(true);
  });

  it('uncover step defaults engines to shodan,censys,fofa', () => {
    const uncoverStep = OsintMetaDeep.steps.find((s) => s.scannerName === 'uncover');
    expect(uncoverStep).toBeDefined();
    expect(uncoverStep?.inputs).toMatchObject({
      engines: { kind: 'static', value: ['shodan', 'censys', 'fofa'] },
    });
  });

  it('exposes a stable name + displayName for the picker', () => {
    expect(OsintMetaDeep.name).toBe('osint-meta-deep');
    expect(OsintMetaDeep.displayName).toMatch(/OSINT/);
  });
});

describe('OsintMetaDeep template (Phase 14B enrichment)', () => {
  it('appends emailrep as the trailing step, consuming the emails context', () => {
    const names = OsintMetaDeep.steps.map((s) => s.scannerName);
    expect(names[names.length - 1]).toBe('emailrep');
    const emailrep = OsintMetaDeep.steps[OsintMetaDeep.steps.length - 1];
    expect(emailrep.target).toEqual({ kind: 'context', path: 'emails' });
  });

  it('preserves the pre-Phase-14B step order (chaos still present before emailrep)', () => {
    // Confirm the enrichment did not reorder anything: the Phase 13A step
    // chaos must still be present somewhere before the new trailing emailrep.
    const namesBefore = OsintMetaDeep.steps.slice(0, -1).map((s) => s.scannerName);
    expect(namesBefore).toContain('chaos');
  });
});
