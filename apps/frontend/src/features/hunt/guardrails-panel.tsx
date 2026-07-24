import type { Guardrails } from './types';

function clampInt(raw: string, min = 1): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < min) return min;
  return n;
}

export function GuardrailsPanel({
  value,
  onChange,
}: {
  value: Guardrails;
  onChange: (g: Guardrails) => void;
}) {
  const timeBudgetMin = Math.max(1, Math.round(value.timeBudgetMs / 60000));

  return (
    <div className="grid grid-cols-2 gap-3 text-left" aria-label="guardrails">
      <label className="block">
        <span className="block text-xs text-slate-300">Max scans</span>
        <input
          type="number"
          min={1}
          aria-label="Max scans"
          className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
          value={value.maxScans}
          onChange={(e) => onChange({ ...value, maxScans: clampInt(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className="block text-xs text-slate-300">Max depth</span>
        <input
          type="number"
          min={1}
          aria-label="Max depth"
          className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
          value={value.maxDepth}
          onChange={(e) => onChange({ ...value, maxDepth: clampInt(e.target.value) })}
        />
      </label>
      <label className="block">
        <span className="block text-xs text-slate-300">Time budget (min)</span>
        <input
          type="number"
          min={1}
          aria-label="Time budget (min)"
          className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
          value={timeBudgetMin}
          onChange={(e) => onChange({ ...value, timeBudgetMs: clampInt(e.target.value) * 60000 })}
        />
      </label>
      <label className="block">
        <span className="block text-xs text-slate-300">Max hosts</span>
        <input
          type="number"
          min={1}
          aria-label="Max hosts"
          className="mt-1 w-full bg-slate-800 rounded px-2 py-1"
          value={value.hostCap}
          onChange={(e) => onChange({ ...value, hostCap: clampInt(e.target.value) })}
        />
      </label>
    </div>
  );
}
