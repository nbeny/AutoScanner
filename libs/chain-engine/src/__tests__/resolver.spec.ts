import { resolveCandidates, applyFilters } from '../resolver';
import type { WorldState, ResolvableEntities } from '../world-state';

const world: WorldState = {
  target: 'example.com',
  openPorts: [],
  services: [],
  technologies: [],
  urls: [],
  endpoints: [],
  findings: [],
  scannersRun: [],
};

const entities: ResolvableEntities = {
  subdomains: [
    { canonicalValue: 'b.example.com', httpStatus: 200 },
    { canonicalValue: 'a.example.com', httpStatus: 404 },
  ],
  ipAddresses: [
    { value: '2.2.2.2', cdn: { behind: false } },
    { value: '1.1.1.1', cdn: { behind: true } },
  ],
  urls: [{ canonicalUrl: 'https://example.com/', statusCode: 200 }],
  endpoints: [],
  emails: [{ address: 'a@example.com' }],
};

describe('resolveCandidates', () => {
  it('resolves target to a single candidate', () => {
    expect(resolveCandidates('target', entities, world)).toEqual([{ value: 'example.com' }]);
  });

  it('resolves ipAddresses with cdn info, sorted canonically', () => {
    const c = resolveCandidates('ipAddresses', entities, world);
    expect(c.map((x) => x.value)).toEqual(['1.1.1.1', '2.2.2.2']); // sorted
    expect(c[0].cdn).toEqual({ behind: true });
  });

  it('resolves subdomains with httpStatus', () => {
    const c = resolveCandidates('subdomains', entities, world);
    expect(c.map((x) => x.value)).toEqual(['a.example.com', 'b.example.com']);
    expect(c[1].httpStatus).toBe(200);
  });
});

describe('applyFilters', () => {
  it('drops CDN IPs with notBehindCdn and records evals', () => {
    const candidates = resolveCandidates('ipAddresses', entities, world);
    const { kept, evaluated } = applyFilters(candidates, [{ pred: 'notBehindCdn' }], world);
    expect(kept.map((k) => k.value)).toEqual(['2.2.2.2']);
    expect(evaluated).toHaveLength(2);
    expect(evaluated.find((e) => e.value === '1.1.1.1')?.keep).toBe(false);
  });

  it('keeps all when no filter', () => {
    const candidates = resolveCandidates('ipAddresses', entities, world);
    const { kept } = applyFilters(candidates, undefined, world);
    expect(kept).toHaveLength(2);
  });
});
