import { evalGuard, evalFilter } from '../predicates';
import type { WorldState, Candidate } from '../world-state';

const world: WorldState = {
  target: 'example.com',
  openPorts: [{ port: 443, protocol: 'tcp' }],
  services: [{ port: 443, name: 'https' }],
  technologies: [{ name: 'WordPress', version: '6.5' }],
  urls: ['https://example.com/'],
  endpoints: ['https://example.com/'],
  findings: [{ title: 'x', severity: 'HIGH' }],
  scannersRun: ['httpx'],
};

describe('guard predicates', () => {
  it('httpDetected passes when a port 443 is open', () => {
    const e = evalGuard({ pred: 'httpDetected' }, world);
    expect(e.passed).toBe(true);
    expect(e.scope).toBe('guard');
    expect(e.version).toBe('1.0.0');
  });

  it('hasOpenPort records expected/actual', () => {
    const e = evalGuard({ pred: 'hasOpenPort', port: 8080 }, world);
    expect(e.passed).toBe(false);
    expect(e.expected).toEqual({ openPort: 8080 });
    expect(e.actual).toEqual([443]);
    expect(e.args).toEqual({ port: 8080 });
  });

  it('techPresent is case-insensitive substring', () => {
    expect(evalGuard({ pred: 'techPresent', name: 'wordpress' }, world).passed).toBe(true);
    expect(evalGuard({ pred: 'techPresent', name: 'drupal' }, world).passed).toBe(false);
  });

  it('hasFindingSeverity compares by rank', () => {
    expect(evalGuard({ pred: 'hasFindingSeverity', atLeast: 'MEDIUM' }, world).passed).toBe(true);
    expect(evalGuard({ pred: 'hasFindingSeverity', atLeast: 'CRITICAL' }, world).passed).toBe(
      false,
    );
  });

  it('scannerRan / scannerNotRun', () => {
    expect(evalGuard({ pred: 'scannerRan', name: 'httpx' }, world).passed).toBe(true);
    expect(evalGuard({ pred: 'scannerNotRun', name: 'nmap' }, world).passed).toBe(true);
  });

  it('throws if a filter-only predicate is used as a guard', () => {
    expect(() => evalGuard({ pred: 'notBehindCdn' }, world)).toThrow(/not a guard/i);
  });
});

describe('filter predicates', () => {
  it('notBehindCdn keeps non-CDN IPs (fail-open on unknown)', () => {
    const known: Candidate = { value: '1.1.1.1', cdn: { behind: true } };
    const nonCdn: Candidate = { value: '2.2.2.2', cdn: { behind: false } };
    const unknown: Candidate = { value: '3.3.3.3' };
    expect(evalFilter({ pred: 'notBehindCdn' }, known, world).passed).toBe(false);
    expect(evalFilter({ pred: 'notBehindCdn' }, nonCdn, world).passed).toBe(true);
    expect(evalFilter({ pred: 'notBehindCdn' }, unknown, world).passed).toBe(true); // fail-open
  });

  it('statusIn reads httpStatus or statusCode', () => {
    const sub: Candidate = { value: 'www', httpStatus: 200 };
    const url: Candidate = { value: 'u', statusCode: 500 };
    expect(evalFilter({ pred: 'statusIn', codes: [200, 301] }, sub, world).passed).toBe(true);
    expect(evalFilter({ pred: 'statusIn', codes: [200, 301] }, url, world).passed).toBe(false);
  });

  it('throws if a guard-only predicate is used as a filter', () => {
    const c: Candidate = { value: 'x' };
    expect(() => evalFilter({ pred: 'httpDetected' }, c, world)).toThrow(/not a filter/i);
  });
});
