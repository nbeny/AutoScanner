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
      'leakix',
      'intelx',
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
  it('runs emailrep consuming the emails context', () => {
    const emailrep = OsintMetaDeep.steps.find((s) => s.scannerName === 'emailrep');
    expect(emailrep?.target).toEqual({ kind: 'context', path: 'emails' });
  });

  it('preserves the pre-Phase-14B step order (chaos still present before emailrep)', () => {
    const names = OsintMetaDeep.steps.map((s) => s.scannerName);
    expect(names.indexOf('chaos')).toBeLessThan(names.indexOf('emailrep'));
  });
});

describe('OsintMetaDeep template (breach/auth modern scanners enrichment)', () => {
  it('appends leakix then intelx as the trailing steps, targeting the engagement root', () => {
    const names = OsintMetaDeep.steps.map((s) => s.scannerName);
    expect(names.slice(-2)).toEqual(['leakix', 'intelx']);

    const leakix = OsintMetaDeep.steps.find((s) => s.scannerName === 'leakix');
    const intelx = OsintMetaDeep.steps.find((s) => s.scannerName === 'intelx');
    expect(leakix?.target).toEqual({ kind: 'context', path: 'target' });
    expect(leakix?.inputs).toEqual({});
    expect(intelx?.target).toEqual({ kind: 'context', path: 'target' });
    expect(intelx?.inputs).toEqual({});
  });
});
