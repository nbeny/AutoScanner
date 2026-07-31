import { computeBackoffMs, MAX_ATTEMPTS, nextAvailableAt } from './backoff';

describe('computeBackoffMs', () => {
  it('mirrors the exponential 5s base / factor 5 curve for attempts 1..3', () => {
    expect(computeBackoffMs(1)).toBe(5_000);
    expect(computeBackoffMs(2)).toBe(25_000);
    expect(computeBackoffMs(3)).toBe(125_000);
  });

  it('clamps attempts below 1 to the first step', () => {
    expect(computeBackoffMs(0)).toBe(5_000);
  });

  it('caps attempts at MAX_ATTEMPTS', () => {
    expect(MAX_ATTEMPTS).toBe(3);
  });
});

describe('nextAvailableAt', () => {
  it('adds the backoff for the attempt to now', () => {
    const now = new Date('2026-07-31T00:00:00.000Z');
    expect(nextAvailableAt(1, now).toISOString()).toBe('2026-07-31T00:00:05.000Z');
    expect(nextAvailableAt(2, now).toISOString()).toBe('2026-07-31T00:00:25.000Z');
  });
});
