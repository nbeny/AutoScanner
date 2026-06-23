import { BUILTIN_TEMPLATES } from '../builtins';
import { ReconPassiveDeep } from '../builtins/recon-passive-deep';

describe('recon-passive-deep template', () => {
  it('is registered in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES.map((t) => t.name)).toContain('recon-passive-deep');
  });

  it('fans four passive sources off the root target then resolves + fingerprints', () => {
    expect(ReconPassiveDeep.name).toBe('recon-passive-deep');
    const scanners = ReconPassiveDeep.steps.map((s) => s.scannerName);
    expect(scanners).toEqual([
      'subfinder',
      'assetfinder',
      'findomain',
      'amass',
      'cero',
      'puredns',
      'dnsx',
      'httpx',
    ]);
  });

  it('runs the four enumerators + puredns against the root target', () => {
    for (const name of ['subfinder', 'assetfinder', 'findomain', 'amass', 'puredns']) {
      const step = ReconPassiveDeep.steps.find((s) => s.scannerName === name)!;
      expect(step.target).toEqual({ kind: 'context', path: 'target' });
    }
  });

  it('resolves + fingerprints over the discovered subdomain set', () => {
    for (const name of ['dnsx', 'httpx']) {
      const step = ReconPassiveDeep.steps.find((s) => s.scannerName === name)!;
      expect(step.target).toEqual({ kind: 'context', path: 'subdomains' });
    }
  });

  it('wires the spec-mandated step inputs', () => {
    const puredns = ReconPassiveDeep.steps.find((s) => s.scannerName === 'puredns')!;
    expect(puredns.inputs).toEqual({ mode: { kind: 'static', value: 'bruteforce' } });

    const httpx = ReconPassiveDeep.steps.find((s) => s.scannerName === 'httpx')!;
    expect(httpx.inputs).toEqual({ techDetect: { kind: 'static', value: true } });

    // The four pure-passive enumerators take no static inputs.
    for (const name of ['subfinder', 'assetfinder', 'findomain', 'amass']) {
      const step = ReconPassiveDeep.steps.find((s) => s.scannerName === name)!;
      expect(step.inputs).toEqual({});
    }
  });
});
