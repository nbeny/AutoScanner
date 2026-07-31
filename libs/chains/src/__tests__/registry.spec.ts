import { ChainRegistry } from '../registry';
import type { ChainDefinition } from '../types';

const demo: ChainDefinition = {
  name: 'demo',
  displayName: 'Demo',
  description: 'd',
  version: '1.0.0',
  whenToUse: 'x',
  produces: ['findings'],
  steps: [{ id: 's1', scannerName: 'httpx', target: { from: 'target' } }],
};

describe('ChainRegistry', () => {
  it('registers and retrieves by name', () => {
    const r = new ChainRegistry();
    r.register(demo);
    expect(r.get('demo').name).toBe('demo');
    expect(r.has('demo')).toBe(true);
    expect(r.list()).toHaveLength(1);
  });

  it('validates on register (throws on invalid)', () => {
    const r = new ChainRegistry();
    expect(() => r.register({ ...demo, steps: [] } as unknown as ChainDefinition)).toThrow();
  });

  it('rejects duplicate names', () => {
    const r = new ChainRegistry();
    r.register(demo);
    expect(() => r.register(demo)).toThrow(/already registered/i);
  });

  it('throws on unknown name in get()', () => {
    const r = new ChainRegistry();
    expect(() => r.get('missing')).toThrow(/unknown chain/i);
  });
});
