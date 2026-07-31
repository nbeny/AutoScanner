import type { ChainDefinition, ChainStep, Predicate } from '../types';

describe('chain types', () => {
  it('accepts a well-formed ChainDefinition literal', () => {
    const step: ChainStep = {
      id: 'httpx',
      scannerName: 'httpx',
      target: { from: 'target' },
      when: [{ pred: 'httpDetected' }],
      inputs: { techDetect: { kind: 'static', value: true } },
    };
    const chain: ChainDefinition = {
      name: 'demo',
      displayName: 'Demo',
      description: 'd',
      version: '1.0.0',
      whenToUse: 'when demoing',
      produces: ['findings'],
      steps: [step],
    };
    expect(chain.steps[0].id).toBe('httpx');
  });

  it('models the full predicate union', () => {
    const preds: Predicate[] = [
      { pred: 'httpDetected' },
      { pred: 'hasOpenPort', port: 443 },
      { pred: 'techPresent', name: 'wordpress' },
      { pred: 'notBehindCdn' },
      { pred: 'behindCdn' },
      { pred: 'statusIn', codes: [200, 301] },
      { pred: 'hasFindingSeverity', atLeast: 'HIGH' },
      { pred: 'scannerRan', name: 'httpx' },
      { pred: 'scannerNotRun', name: 'nmap' },
    ];
    expect(preds).toHaveLength(9);
  });
});
