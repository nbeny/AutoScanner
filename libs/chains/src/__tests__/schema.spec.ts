import { validateChain, chainDefinitionSchema } from '../schema';
import type { ChainDefinition } from '../types';

const valid: ChainDefinition = {
  name: 'demo',
  displayName: 'Demo',
  description: 'd',
  version: '1.0.0',
  whenToUse: 'when demoing',
  produces: ['findings'],
  steps: [
    {
      id: 'httpx',
      scannerName: 'httpx',
      target: { from: 'target' },
      when: [{ pred: 'httpDetected' }],
    },
  ],
};

describe('validateChain', () => {
  it('accepts a valid chain', () => {
    expect(() => validateChain(valid)).not.toThrow();
    expect(validateChain(valid).name).toBe('demo');
  });

  it('rejects an unknown predicate', () => {
    const bad = {
      ...valid,
      steps: [{ ...valid.steps[0], when: [{ pred: 'nope' }] }],
    };
    expect(() => validateChain(bad)).toThrow();
  });

  it('rejects duplicate step ids', () => {
    const dup = {
      ...valid,
      steps: [valid.steps[0], valid.steps[0]],
    };
    expect(() => validateChain(dup)).toThrow(/duplicate step id/i);
  });

  it('rejects a missing version', () => {
    const { version: _omit, ...noVersion } = valid;
    expect(chainDefinitionSchema.safeParse(noVersion).success).toBe(false);
  });
});
