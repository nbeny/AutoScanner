import { decideOutcome, isDue, RetryAfterError } from './kafka-consumer.runner';
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

  it('honors RetryAfterError without spending an attempt', () => {
    const now = new Date('2026-07-31T00:00:00Z');
    const out = decideOutcome('security.cve.enrich.requested', 1, new RetryAfterError(30_000), now);
    expect(out.kind).toBe('retry');
    if (out.kind === 'retry') {
      expect(out.topic).toBe('security.cve.enrich.requested.retry');
      expect(out.nextAttempt).toBe(1); // unchanged
      expect(out.availableAt.getTime()).toBe(now.getTime() + 30_000);
    }
  });

  it('honors RetryAfterError even at the last attempt (never DLQs a rate-limit)', () => {
    const now = new Date('2026-07-31T00:00:00Z');
    const out = decideOutcome(
      'security.cve.enrich.requested',
      MAX_ATTEMPTS,
      new RetryAfterError(60_000),
      now,
    );
    expect(out.kind).toBe('retry');
    if (out.kind === 'retry') expect(out.nextAttempt).toBe(MAX_ATTEMPTS);
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
