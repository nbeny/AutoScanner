import { decideOutcome, isDue } from './kafka-consumer.runner';
import { MAX_ATTEMPTS } from '../backoff';

describe('decideOutcome', () => {
  it('routes to retry with backoff when attempts remain', () => {
    const now = new Date('2026-07-31T00:00:00Z');
    const out = decideOutcome('security.report.requested', 1, new Error('boom'), now);
    expect(out.kind).toBe('retry');
    if (out.kind === 'retry') {
      expect(out.topic).toBe('security.report.requested.retry');
      expect(out.nextAttempt).toBe(2);
      expect(out.availableAt.getTime()).toBe(now.getTime() + 5_000);
    }
  });

  it('routes to dlq at the last attempt', () => {
    const out = decideOutcome(
      'security.report.requested',
      MAX_ATTEMPTS,
      new Error('boom'),
      new Date(),
    );
    expect(out.kind).toBe('dlq');
    if (out.kind === 'dlq') expect(out.topic).toBe('security.report.requested.dlq');
  });
});

describe('isDue', () => {
  it('true when availableAt missing', () => {
    expect(isDue(undefined, new Date())).toBe(true);
  });
  it('false when availableAt in the future', () => {
    const now = new Date('2026-07-31T00:00:00Z');
    expect(isDue(new Date(now.getTime() + 1000).toISOString(), now)).toBe(false);
  });
  it('true when availableAt in the past', () => {
    const now = new Date('2026-07-31T00:00:00Z');
    expect(isDue(new Date(now.getTime() - 1000).toISOString(), now)).toBe(true);
  });
});
