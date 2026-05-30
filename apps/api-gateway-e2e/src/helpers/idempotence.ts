import type { Asset } from './types';

/**
 * Throws if the per-kind row count drifted beyond ±`tolerancePct` between
 * two scenario runs. Used to prove the @@unique / merge logic dedupes the
 * second pass — without it, a re-run would roughly double the counts.
 *
 * The message intentionally includes the label so a failing run names the
 * misbehaving entity (e.g. "SUBDOMAIN count drifted beyond ±10%: ..."),
 * which is what the CI log needs to triage.
 */
export function assertWithinPercent(
  first: number,
  second: number,
  label: string,
  tolerancePct = 10,
): void {
  const drift = Math.abs(second - first);
  const tolerance = Math.max(1, Math.ceil(first * (tolerancePct / 100)));
  if (drift > tolerance) {
    throw new Error(
      `${label} count drifted beyond ±${tolerancePct}%: first=${first} second=${second} drift=${drift} tolerance=${tolerance}`,
    );
  }
}

/**
 * Asserts that the canonical values seen in `firstSet` are still present
 * in `secondSet` at ≥ `minOverlapPct`. Default 90% absorbs upstream
 * discovery flakiness (subfinder sources can fluctuate) while still
 * catching catastrophic regressions where the dedup logic loses rows.
 */
export function assertCanonicalOverlap(
  firstSet: Asset[],
  secondSet: Asset[],
  minOverlapPct = 90,
): void {
  const firstCanon = new Set(firstSet.map((s) => s.canonicalValue).filter(Boolean) as string[]);
  const secondCanon = new Set(secondSet.map((s) => s.canonicalValue).filter(Boolean) as string[]);
  const persisted = [...firstCanon].filter((c) => secondCanon.has(c)).length;
  const minimum = Math.floor(firstCanon.size * (minOverlapPct / 100));
  if (persisted < minimum) {
    throw new Error(
      `canonical overlap below ${minOverlapPct}%: persisted=${persisted} required=${minimum} firstSize=${firstCanon.size}`,
    );
  }
}

/**
 * Asserts at least one asset shared across both runs had its `lastSeenAt`
 * advanced (i.e. the parser updated the row in place instead of inserting
 * a duplicate). Returns the count of refreshed rows so callers can make
 * stricter per-scenario assertions if needed.
 */
export function assertLastSeenRefreshed(firstSet: Asset[], secondSet: Asset[]): number {
  const firstSeenByCanon = new Map<string, string>();
  for (const a of firstSet) {
    if (a.canonicalValue && a.lastSeenAt) firstSeenByCanon.set(a.canonicalValue, a.lastSeenAt);
  }
  const refreshed = secondSet.filter((s) => {
    if (!s.canonicalValue || !s.lastSeenAt) return false;
    const prior = firstSeenByCanon.get(s.canonicalValue);
    if (!prior) return false;
    return new Date(s.lastSeenAt).getTime() >= new Date(prior).getTime();
  });
  if (refreshed.length === 0) {
    throw new Error(
      'no shared asset had its lastSeenAt advanced between runs — parser inserted duplicates instead of updating in place',
    );
  }
  return refreshed.length;
}
