export const MAX_ATTEMPTS = 3;
const BASE_MS = 5_000;
const FACTOR = 5;

export function computeBackoffMs(attempt: number): number {
  const a = Math.max(1, attempt);
  return BASE_MS * Math.pow(FACTOR, a - 1);
}

export function nextAvailableAt(attempt: number, now: Date): Date {
  return new Date(now.getTime() + computeBackoffMs(attempt));
}
