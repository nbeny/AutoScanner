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
    ]);
  });

  it('each step targets the engagement target by default', () => {
    expect(
      OsintMetaDeep.steps.every((s) => s.target.kind === 'context' && s.target.path === 'target'),
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
