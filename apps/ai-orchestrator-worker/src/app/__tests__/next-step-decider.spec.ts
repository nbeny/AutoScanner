import type { DecisionAction, DecisionOutcome } from '../next-step-decider';

describe('decision types', () => {
  it('models run and skip actions', () => {
    const run: DecisionAction = {
      kind: 'run',
      scannerName: 'nmap',
      target: '1.1.1.1',
      inputs: {},
      stepId: 'nmap',
      rationale: 'scan ports',
    };
    const skip: DecisionAction = {
      kind: 'skip',
      scannerName: 'wpscan',
      target: 'example.com',
      stepId: 'wpscan',
      skipReason: 'gate: techPresent non satisfait',
    };
    const outcome: DecisionOutcome = { done: false, actions: [run, skip] };
    expect(outcome.actions).toHaveLength(2);
  });
});
