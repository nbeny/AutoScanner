import { BUILTIN_TEMPLATES, OsintPassive } from '../index';

describe('OsintPassive', () => {
  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES).toContain(OsintPassive);
  });

  it('has name "osint-passive"', () => {
    expect(OsintPassive.name).toBe('osint-passive');
  });

  it('has exactly 3 steps: crtsh then whois then theharvester', () => {
    expect(OsintPassive.steps).toHaveLength(3);
    expect(OsintPassive.steps.map((s) => s.scannerName)).toEqual([
      'crtsh',
      'whois',
      'theharvester',
    ]);
  });

  it('all steps target context path "target" with empty inputs', () => {
    for (const step of OsintPassive.steps) {
      expect(step.target).toEqual({ kind: 'context', path: 'target' });
      expect(step.inputs).toEqual({});
    }
  });
});
