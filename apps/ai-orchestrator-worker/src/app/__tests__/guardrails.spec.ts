import { evaluateGuardrails, DEFAULT_GUARDRAILS } from '../guardrails';

describe('evaluateGuardrails', () => {
  it('stops when scan cap reached', () => {
    expect(
      evaluateGuardrails(
        { maxScans: 5, maxDepth: 8, timeBudgetMs: 1e9, hostCap: 10 },
        { scanCount: 5, depth: 1, elapsedMs: 0 },
      ).stop,
    ).toBe(true);
  });

  it('stops on depth', () => {
    expect(
      evaluateGuardrails(DEFAULT_GUARDRAILS, {
        scanCount: 0,
        depth: DEFAULT_GUARDRAILS.maxDepth,
        elapsedMs: 0,
      }).stop,
    ).toBe(true);
  });

  it('stops on time', () => {
    expect(
      evaluateGuardrails(
        { maxScans: 999, maxDepth: 999, timeBudgetMs: 1000, hostCap: 1 },
        { scanCount: 0, depth: 0, elapsedMs: 1001 },
      ).stop,
    ).toBe(true);
  });

  it('continues under caps', () => {
    expect(
      evaluateGuardrails(DEFAULT_GUARDRAILS, { scanCount: 1, depth: 1, elapsedMs: 1 }).stop,
    ).toBe(false);
  });

  it('reports the tripped reason', () => {
    expect(
      evaluateGuardrails(
        { maxScans: 1, maxDepth: 8, timeBudgetMs: 1e9, hostCap: 1 },
        { scanCount: 1, depth: 0, elapsedMs: 0 },
      ).reason,
    ).toBe('maxScans');
  });
});
