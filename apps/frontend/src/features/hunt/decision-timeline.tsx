import type { AiDecision } from './types';

function formatTs(ts: string): string {
  const t = new Date(ts).getTime();
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleTimeString();
}

/**
 * Vertical list of AI planner decisions, one row per round. Shows a
 * "degraded" badge when the planner fell back to a heuristic plan.
 */
export function DecisionTimeline({ decisions }: { decisions: AiDecision[] }) {
  if (decisions.length === 0) {
    return <p className="text-slate-500 text-sm">No decisions yet.</p>;
  }

  const sorted = [...decisions].sort((a, b) => a.round - b.round);

  return (
    <ol className="space-y-2" aria-label="decision-timeline">
      {sorted.map((d) => (
        <li key={d.id} className="flex items-center gap-3 bg-slate-900 rounded px-3 py-2 text-sm">
          <span className="font-medium text-slate-200">Round {d.round}</span>
          <span className="text-xs text-slate-500">{formatTs(d.createdAt)}</span>
          {d.degraded ? (
            <span className="ml-auto px-2 py-0.5 rounded text-xs bg-amber-900/40 text-amber-300 border border-amber-700">
              degraded
            </span>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
