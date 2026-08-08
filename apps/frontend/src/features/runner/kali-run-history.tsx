import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { KALI_TOOL_RUNS_QUERY } from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

interface KaliToolRunListItem {
  id: string;
  binary: string;
  args: string[];
  status: string;
  outputFormat: string;
  exitCode: number | null;
  createdAt: string;
}

/** Status → pill classes. Unknown statuses fall back to the neutral style. */
const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-slate-700/50 text-slate-300',
  RUNNING: 'bg-neon-cyan/15 text-neon-cyan',
  COMPLETED: 'bg-emerald-900/50 text-emerald-300',
  FAILED: 'bg-rose-900/50 text-rose-300',
  CANCELLED: 'bg-amber-900/40 text-amber-300',
};

/**
 * Past Kali runner executions for the current engagement. Polls so in-flight
 * runs (PENDING/RUNNING) update their status in place. Each row links to the
 * run detail page (`/runner/:id`).
 */
export function KaliRunHistory({ engagementId }: { engagementId?: string }) {
  const { data, loading, error } = useQuery<{ kaliToolRuns: KaliToolRunListItem[] }>(
    KALI_TOOL_RUNS_QUERY,
    {
      skip: !engagementId,
      variables: engagementId ? { engagementId } : undefined,
      pollInterval: 5000,
      fetchPolicy: 'cache-and-network',
    },
  );

  if (!engagementId) return null;

  const runs = data?.kaliToolRuns ?? [];

  return (
    <section aria-label="kali-run-history" className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-300">Historique des runs</h2>

      {error ? (
        <p role="alert" className="text-xs text-rose-400">
          {error.message}
        </p>
      ) : null}

      {!error && runs.length === 0 ? (
        <p className="text-xs text-slate-500">
          {loading ? 'Chargement…' : 'Aucun run pour ce périmètre.'}
        </p>
      ) : null}

      {runs.length > 0 ? (
        <ul className="divide-y divide-space-800 rounded-md border border-space-800">
          {runs.map((run) => (
            <li key={run.id}>
              <Link
                to={`/runner/${run.id}`}
                className="flex items-center gap-3 px-3 py-2 hover:bg-space-800/50"
              >
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase ${
                    STATUS_STYLE[run.status] ?? 'bg-slate-700/50 text-slate-300'
                  }`}
                >
                  {run.status}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-200">
                  <span className="text-neon-cyan">{run.binary}</span> {run.args.join(' ')}
                </span>
                {run.exitCode != null ? (
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">
                    exit {run.exitCode}
                  </span>
                ) : null}
                <span className="shrink-0 text-[10px] text-slate-500">
                  {formatDate(run.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
