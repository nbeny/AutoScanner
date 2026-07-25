import { useState } from 'react';
import { useSubscription } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { ENGAGEMENT_UPDATED_SUBSCRIPTION } from '../../lib/graphql/queries';

interface EngagementUpdate {
  kind: string;
  severity?: string | null;
  title?: string | null;
  ts: string;
}

interface FluxItem {
  severity: string;
  title: string;
  ts: string;
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'text-rose-400 border-rose-500/40',
  HIGH: 'text-orange-400 border-orange-500/40',
  MEDIUM: 'text-amber-400 border-amber-500/40',
  LOW: 'text-sky-400 border-sky-500/40',
  INFO: 'text-slate-400 border-slate-500/40',
};

export function FindingsFluxFeed({ engagementId }: { engagementId?: string }) {
  const [items, setItems] = useState<FluxItem[]>([]);

  useSubscription<{ engagementUpdated: EngagementUpdate }>(ENGAGEMENT_UPDATED_SUBSCRIPTION, {
    skip: !engagementId,
    variables: engagementId ? { engagementId } : undefined,
    onData: ({ data }) => {
      const ev = data.data?.engagementUpdated;
      if (ev && ev.kind === 'FINDING_RAISED') {
        setItems((prev) =>
          [
            { severity: ev.severity ?? 'INFO', title: ev.title ?? '(sans titre)', ts: ev.ts },
            ...prev,
          ].slice(0, 30),
        );
      }
    },
  });

  if (!engagementId) {
    return (
      <Panel aria-label="flux-no-scope" className="space-y-1">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">Findings en flux</h2>
        <p className="text-sm text-slate-500">Sélectionne un périmètre pour le flux live.</p>
      </Panel>
    );
  }

  return (
    <Panel aria-label="findings-flux" className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">Findings en flux</h2>
      {items.length === 0 ? (
        <p className="text-sm text-slate-500">En attente de findings…</p>
      ) : null}
      <ul className="space-y-1">
        {items.map((it, i) => (
          <li key={i} className="flex items-center gap-2 text-xs">
            <span
              className={`rounded-full border px-2 py-0.5 font-semibold ${SEV_COLOR[it.severity] ?? SEV_COLOR.INFO}`}
            >
              {it.severity}
            </span>
            <span className="truncate text-slate-200">{it.title}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
