import { useMemo } from 'react';

export interface AssetProvenanceObservation {
  id: string;
  kind: string;
  scannerName: string;
  ts: string; // ISO date string from GraphQL
  payload?: unknown;
}

export interface AssetProvenanceTabProps {
  observations: AssetProvenanceObservation[];
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}

const KIND_BADGE: Record<string, string> = {
  DISCOVERED: 'bg-blue-100 text-blue-800',
  RESOLVED: 'bg-indigo-100 text-indigo-800',
  PORT_OPEN: 'bg-emerald-100 text-emerald-800',
  SERVICE_DETECTED: 'bg-teal-100 text-teal-800',
  TECH_DETECTED: 'bg-purple-100 text-purple-800',
  HTTP_PROBED: 'bg-cyan-100 text-cyan-800',
  DNS_RECORD: 'bg-amber-100 text-amber-800',
  FINDING_RAISED: 'bg-rose-100 text-rose-800',
};

function dayKey(iso: string): string {
  return iso.slice(0, 10); // YYYY-MM-DD
}

function timeOfDay(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

export function AssetProvenanceTab({
  observations,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
}: AssetProvenanceTabProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, AssetProvenanceObservation[]>();
    for (const o of observations) {
      const k = dayKey(o.ts);
      const bucket = map.get(k);
      if (bucket) bucket.push(o);
      else map.set(k, [o]);
    }
    for (const list of map.values()) list.sort((a, b) => b.ts.localeCompare(a.ts));
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [observations]);

  if (observations.length === 0) {
    return (
      <div className="rounded border border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        Aucune observation enregistrée pour cet asset.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {grouped.map(([day, items]) => (
        <section key={day}>
          <h3 className="mb-2 text-sm font-semibold text-slate-700">{day}</h3>
          <ul className="space-y-2">
            {items.map((o) => (
              <li
                key={o.id}
                className="flex items-start gap-3 rounded border border-slate-200 bg-white p-3"
              >
                <span className="w-16 shrink-0 text-xs text-slate-500">{timeOfDay(o.ts)}</span>
                <span
                  className={`shrink-0 rounded px-2 py-0.5 text-xs font-medium ${
                    KIND_BADGE[o.kind] ?? 'bg-slate-100 text-slate-800'
                  }`}
                >
                  {o.kind}
                </span>
                <span className="shrink-0 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700">
                  {o.scannerName}
                </span>
                {o.payload !== null && o.payload !== undefined ? (
                  <pre className="ml-auto max-w-[60%] overflow-x-auto rounded bg-slate-50 p-2 text-xs text-slate-600">
                    {JSON.stringify(o.payload, null, 2)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ))}
      {hasMore && onLoadMore ? (
        <div className="flex items-center justify-center pt-2">
          <button
            type="button"
            onClick={onLoadMore}
            disabled={loadingMore}
            className="rounded border border-slate-300 px-4 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loadingMore ? 'Chargement…' : 'Show older'}
          </button>
        </div>
      ) : null}
    </div>
  );
}
