const SEVERITY_STYLE: Record<string, string> = {
  CRITICAL: 'bg-red-700 text-red-50',
  HIGH: 'bg-orange-600 text-orange-50',
  MEDIUM: 'bg-yellow-600 text-yellow-50',
  LOW: 'bg-blue-600 text-blue-50',
  INFO: 'bg-slate-600 text-slate-50',
};

export interface QueueItem {
  id: string;
  title: string;
  severity: string;
  status: string;
  riskScore: number;
  assetId: string;
  sources: string[];
}

export function TriageQueue({
  items,
  selectedId,
  onSelect,
}: {
  items: QueueItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const counts = items.reduce<Record<string, number>>((acc, i) => {
    acc[i.status] = (acc[i.status] ?? 0) + 1;
    return acc;
  }, {});

  return (
    <div className="flex flex-col h-full border-r border-slate-800">
      <ul className="flex-1 overflow-y-auto" aria-label="triage-queue">
        {items.map((i) => {
          const active = i.id === selectedId;
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => onSelect(i.id)}
                aria-current={active ? 'true' : undefined}
                className={
                  'w-full text-left px-3 py-2 flex items-center gap-2 border-l-2 ' +
                  (active
                    ? 'border-indigo-400 bg-slate-800/60'
                    : 'border-transparent hover:bg-slate-800/30')
                }
              >
                <span
                  className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                    SEVERITY_STYLE[i.severity] ?? SEVERITY_STYLE.INFO
                  }`}
                >
                  {i.severity}
                </span>
                <span className="flex-1 truncate text-sm">{i.title}</span>
                <span className="font-mono text-xs text-slate-400">{i.riskScore}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <div className="px-3 py-2 text-xs text-slate-400 border-t border-slate-800">
        {counts.OPEN ?? 0} open · {counts.TRIAGED ?? 0} triaged · {counts.CONFIRMED ?? 0} confirmed
      </div>
    </div>
  );
}
