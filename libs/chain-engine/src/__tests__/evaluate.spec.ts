import { evaluate } from '../evaluate';
import type { WorldState, ResolvableEntities } from '../world-state';
import type { ChainDefinition } from '@autoscanner/chains';

const chain: ChainDefinition = {
  name: 'demo',
  displayName: 'Demo',
  description: 'd',
  version: '1.0.0',
  whenToUse: 'x',
  produces: ['findings'],
  steps: [
    { id: 's1', scannerName: 'httpx', target: { from: 'target' } },
    { id: 's2', scannerName: 'nuclei', target: { from: 'urls' }, when: [{ pred: 'httpDetected' }] },
    {
      id: 's3',
      scannerName: 'nmap',
      target: { from: 'ipAddresses', filter: [{ pred: 'notBehindCdn' }] },
    },
  ],
};

const emptyEntities: ResolvableEntities = {
  subdomains: [],
  ipAddresses: [],
  urls: [],
  endpoints: [],
  emails: [],
};

function worldWith(over: Partial<WorldState> = {}): WorldState {
  return {
    target: 'example.com',
    openPorts: [],
    services: [],
    technologies: [],
    urls: [],
    endpoints: [],
    findings: [],
    scannersRun: [],
    ...over,
  };
}

describe('evaluate', () => {
  it('returns the first unexecuted step and marks it run', () => {
    const res = evaluate(chain, worldWith(), emptyEntities, new Set());
    expect(res.done).toBe(false);
    expect(res.next?.stepId).toBe('s1');
    expect(res.next?.action).toBe('run');
    expect(res.catalogVersion).toBe('1.0.0');
  });

  it('skips a gated step when the guard fails', () => {
    const res = evaluate(chain, worldWith(), emptyEntities, new Set(['s1']));
    expect(res.next?.stepId).toBe('s2');
    expect(res.next?.action).toBe('skip');
    expect(res.next?.skipReason).toMatch(/gate/i);
    expect(res.next?.gate.passed).toBe(false);
  });

  it('runs a gated step when the guard passes', () => {
    const world = worldWith({ openPorts: [{ port: 443, protocol: 'tcp' }] });
    const entities: ResolvableEntities = {
      ...emptyEntities,
      urls: [{ canonicalUrl: 'https://example.com/', statusCode: 200 }],
    };
    const res = evaluate(chain, world, entities, new Set(['s1']));
    expect(res.next?.stepId).toBe('s2');
    expect(res.next?.action).toBe('run');
    expect(res.next?.targets.map((t) => t.value)).toEqual(['https://example.com/']);
  });

  it('skips with "aucune cible" when the filter removes everything', () => {
    const entities: ResolvableEntities = {
      ...emptyEntities,
      ipAddresses: [{ value: '1.1.1.1', cdn: { behind: true } }],
    };
    const res = evaluate(chain, worldWith(), entities, new Set(['s1', 's2']));
    expect(res.next?.stepId).toBe('s3');
    expect(res.next?.action).toBe('skip');
    expect(res.next?.skipReason).toMatch(/aucune cible/i);
  });

  it('returns done when all steps are executed', () => {
    const res = evaluate(chain, worldWith(), emptyEntities, new Set(['s1', 's2', 's3']));
    expect(res.done).toBe(true);
    expect(res.next).toBeUndefined();
  });
});
