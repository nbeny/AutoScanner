import { BUILTIN_TEMPLATES, WebFingerprint } from '../index';

describe('WebFingerprint template', () => {
  it('is present in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES).toContain(WebFingerprint);
  });

  it('has name "web-fingerprint"', () => {
    expect(WebFingerprint.name).toBe('web-fingerprint');
  });

  it('has exactly 4 steps: httpx, tlsx, whatweb, sslscan', () => {
    expect(WebFingerprint.steps).toHaveLength(4);
    const names = WebFingerprint.steps.map((s) => s.scannerName);
    expect(names).toEqual(['httpx', 'tlsx', 'whatweb', 'sslscan']);
  });

  it('all steps target {kind:"context", path:"subdomains"}', () => {
    for (const step of WebFingerprint.steps) {
      expect(step.target).toEqual({ kind: 'context', path: 'subdomains' });
    }
  });

  it('httpx step has techDetect static true', () => {
    const [httpx] = WebFingerprint.steps;
    expect(httpx.inputs).toEqual({ techDetect: { kind: 'static', value: true } });
  });

  it('tlsx step has empty inputs', () => {
    const [, tlsx] = WebFingerprint.steps;
    expect(tlsx.inputs).toEqual({});
  });

  it('whatweb step has empty inputs', () => {
    const [, , whatweb] = WebFingerprint.steps;
    expect(whatweb.inputs).toEqual({});
  });

  it('sslscan step has empty inputs and targets subdomains', () => {
    const [, , , sslscan] = WebFingerprint.steps;
    expect(sslscan.scannerName).toBe('sslscan');
    expect(sslscan.inputs).toEqual({});
    expect(sslscan.target).toEqual({ kind: 'context', path: 'subdomains' });
  });
});
