import { useQuery } from '@apollo/client';
import { RECENT_TEMPLATE_RUNS_QUERY } from '../../../lib/graphql/queries';

type Status = 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

interface Run {
  id: string;
  templateName: string;
  status: Status;
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  newAssetsCount: number;
  newFindingsCount: number;
}

const STATUS_STYLE: Record<Status, string> = {
  PENDING: 'bg-slate-700 text-slate-100',
  RUNNING: 'bg-indigo-700 text-indigo-50',
  COMPLETED: 'bg-emerald-700 text-emerald-50',
  FAILED: 'bg-red-700 text-red-50',
  CANCELLED: 'bg-slate-600 text-slate-200',
};

function formatDuration(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s}s`;
}

export function RecentRunsTimeline({
  engagementId,
  limit = 5,
}: {
  engagementId: string;
  limit?: number;
}) {
  const { data, loading, error } = useQuery<{ recentTemplateRuns: Run[] }>(
    RECENT_TEMPLATE_RUNS_QUERY,
    { variables: { engagementId, limit } },
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading recent runs…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const runs = data?.recentTemplateRuns ?? [];
  if (runs.length === 0) {
    return (
      <section className="bg-slate-900 rounded p-4">
        <h3 className="text-lg font-semibold mb-2">Recent template runs</h3>
        <p className="text-slate-500 text-sm">No template runs yet.</p>
      </section>
    );
  }

  return (
    <section className="bg-slate-900 rounded p-4" aria-label="recent-template-runs">
      <h3 className="text-lg font-semibold mb-3">Recent template runs</h3>
      <ul className="space-y-2">
        {runs.map((r) => (
          <li
            key={r.id}
            className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0 flex items-center gap-3 flex-wrap"
          >
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
            >
              {r.status}
            </span>
            <span className="font-mono text-sm text-slate-100">{r.templateName}</span>
            <span className="text-xs text-slate-400">
              {r.durationMs != null
                ? formatDuration(r.durationMs)
                : r.status === 'RUNNING'
                  ? 'running…'
                  : '—'}
            </span>
            <span className="ml-auto flex gap-2 text-xs">
              <span className="text-emerald-300">+{r.newAssetsCount} assets</span>
              <span className="text-orange-300">+{r.newFindingsCount} findings</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
