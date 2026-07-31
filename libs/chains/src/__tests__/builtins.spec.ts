import { BUILTIN_CHAINS } from '../builtins';
import { ChainRegistry } from '../registry';
import { validateChain } from '../schema';

describe('BUILTIN_CHAINS', () => {
  it('contains the two flagship chains', () => {
    const names = BUILTIN_CHAINS.map((c) => c.name).sort();
    expect(names).toEqual(['ip-recon-full', 'web-full']);
  });

  it('every builtin validates', () => {
    for (const c of BUILTIN_CHAINS) expect(() => validateChain(c)).not.toThrow();
  });

  it('registers cleanly (unique names)', () => {
    const r = new ChainRegistry();
    for (const c of BUILTIN_CHAINS) r.register(c);
    expect(r.list()).toHaveLength(BUILTIN_CHAINS.length);
  });
});
