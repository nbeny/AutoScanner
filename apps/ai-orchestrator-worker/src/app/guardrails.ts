/**
 * Pure guardrail logic for the autonomous AI scan loop.
 *
 * The loop consults {@link evaluateGuardrails} before dispatching each scan;
 * when it returns `{ stop: true }` the run terminates and records `reason` for
 * the audit trail. Kept dependency-free so the API and frontend can reuse
 * {@link DEFAULT_GUARDRAILS} as the source of truth for default caps.
 */

/** Operator-configurable caps that bound an autonomous run. */
export interface Guardrails {
  /** Hard cap on total scans dispatched in a run. */
  maxScans: number;
  /** Hard cap on recursion depth (hops away from the seed target). */
  maxDepth: number;
  /** Wallclock budget for the whole run, in milliseconds. */
  timeBudgetMs: number;
  /** Hard cap on distinct hosts the run may touch. */
  hostCap: number;
}

/** Default caps — the single source of truth reused by the API and frontend. */
export const DEFAULT_GUARDRAILS: Guardrails = {
  maxScans: 200,
  maxDepth: 8,
  timeBudgetMs: 60 * 60 * 1000,
  hostCap: 16,
};

/** Live progress the loop feeds into each guardrail check. */
export interface RunProgress {
  scanCount: number;
  depth: number;
  elapsedMs: number;
}

/**
 * Decide whether the run must stop. Checks are evaluated in priority order
 * (scans -> depth -> time); the first tripped cap wins and is surfaced via
 * `reason`.
 */
export function evaluateGuardrails(
  g: Guardrails,
  p: RunProgress,
): { stop: boolean; reason?: string } {
  if (p.scanCount >= g.maxScans) return { stop: true, reason: 'maxScans' };
  if (p.depth >= g.maxDepth) return { stop: true, reason: 'maxDepth' };
  if (p.elapsedMs >= g.timeBudgetMs) return { stop: true, reason: 'timeBudgetMs' };
  return { stop: false };
}
