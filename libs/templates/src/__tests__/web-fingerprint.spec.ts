import { BUILTIN_TEMPLATES, WebFingerprint } from '../index';

describe('WebFingerprint template', () => {
  it('is present in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES).toContain(WebFingerprint);
  });

  it('has name "web-fingerprint"', () => {
    expect(WebFingerprint.name).toBe('web-fingerprint');
  });

  it('has exactly 7 steps after Phase 13C enrichment: httpx, feroxbuster, tlsx, whatweb, sslscan, webanalyze, subjs', () => {
    expect(WebFingerprint.steps).toHaveLength(7);
    const names = WebFingerprint.steps.map((s) => s.scannerName);
    expect(names).toEqual([
      'httpx',
      'feroxbuster',
      'tlsx',
      'whatweb',
      'sslscan',
      'webanalyze',
      'subjs',
    ]);
  });

  it('tlsx/whatweb/sslscan target {kind:"context", path:"subdomains"}', () => {
    const subdomainSteps = ['tlsx', 'whatweb', 'sslscan'];
    for (const name of subdomainSteps) {
      const step = WebFingerprint.steps.find((s) => s.scannerName === name);
      expect(step?.target).toEqual({ kind: 'context', path: 'subdomains' });
    }
  });

  it('webanalyze and subjs steps target {kind:"context", path:"target"}', () => {
    const webanalyze = WebFingerprint.steps.find((s) => s.scannerName === 'webanalyze');
    const subjs = WebFingerprint.steps.find((s) => s.scannerName === 'subjs');
    expect(webanalyze?.target).toEqual({ kind: 'context', path: 'target' });
    expect(subjs?.target).toEqual({ kind: 'context', path: 'target' });
  });

  it('httpx step has techDetect static true', () => {
    const [httpx] = WebFingerprint.steps;
    expect(httpx.inputs).toEqual({ techDetect: { kind: 'static', value: true } });
  });

  it('tlsx step has empty inputs', () => {
    const tlsx = WebFingerprint.steps.find((s) => s.scannerName === 'tlsx');
    expect(tlsx?.inputs).toEqual({});
  });

  it('whatweb step has empty inputs', () => {
    const whatweb = WebFingerprint.steps.find((s) => s.scannerName === 'whatweb');
    expect(whatweb?.inputs).toEqual({});
  });

  it('sslscan step has empty inputs and targets subdomains', () => {
    const sslscan = WebFingerprint.steps.find((s) => s.scannerName === 'sslscan');
    expect(sslscan?.inputs).toEqual({});
    expect(sslscan?.target).toEqual({ kind: 'context', path: 'subdomains' });
  });
});

describe('WebFingerprint template (Phase 13C enrichment)', () => {
  it('preserves existing steps (httpx, tlsx, whatweb, sslscan, webanalyze, subjs)', () => {
    const names = WebFingerprint.steps.map((s) => s.scannerName);
    for (const expected of ['httpx', 'tlsx', 'whatweb', 'sslscan', 'webanalyze', 'subjs']) {
      expect(names).toContain(expected);
    }
  });

  it('adds feroxbuster quick-mode (depth 1) right after httpx', () => {
    const idxHttpx = WebFingerprint.steps.findIndex((s) => s.scannerName === 'httpx');
    const idxFerox = WebFingerprint.steps.findIndex((s) => s.scannerName === 'feroxbuster');
    expect(idxFerox).toBe(idxHttpx + 1);
    const ferox = WebFingerprint.steps[idxFerox];
    expect(ferox.inputs).toEqual({ depth: { kind: 'static', value: 1 } });
    expect(ferox.target).toEqual({ kind: 'context', path: 'target' });
  });
});
