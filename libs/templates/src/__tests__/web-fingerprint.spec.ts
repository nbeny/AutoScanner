import { BUILTIN_TEMPLATES, WebFingerprint } from '../index';

describe('WebFingerprint template', () => {
  it('is present in BUILTIN_TEMPLATES', () => {
    expect(BUILTIN_TEMPLATES).toContain(WebFingerprint);
  });

  it('has name "web-fingerprint"', () => {
    expect(WebFingerprint.name).toBe('web-fingerprint');
  });

  it('has exactly 6 steps: httpx, tlsx, whatweb, sslscan, webanalyze, subjs', () => {
    expect(WebFingerprint.steps).toHaveLength(6);
    const names = WebFingerprint.steps.map((s) => s.scannerName);
    expect(names).toEqual(['httpx', 'tlsx', 'whatweb', 'sslscan', 'webanalyze', 'subjs']);
  });

  it('first 4 steps target {kind:"context", path:"subdomains"}', () => {
    for (const step of WebFingerprint.steps.slice(0, 4)) {
      expect(step.target).toEqual({ kind: 'context', path: 'subdomains' });
    }
  });

  it('webanalyze and subjs steps target {kind:"context", path:"target"}', () => {
    const [, , , , webanalyze, subjs] = WebFingerprint.steps;
    expect(webanalyze.target).toEqual({ kind: 'context', path: 'target' });
    expect(subjs.target).toEqual({ kind: 'context', path: 'target' });
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
