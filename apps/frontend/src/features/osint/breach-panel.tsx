import { useQuery } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { BREACH_EXPOSURES_QUERY } from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

interface BreachExposureRow {
  id: string;
  seed: string;
  breachName: string;
  breachDate: string | null;
  dataClasses: string[];
  passwordExposed: boolean;
  severity: string;
  source: string;
  lastSeenAt: string;
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'text-red-400 border-red-500/40',
  HIGH: 'text-orange-400 border-orange-500/40',
  MEDIUM: 'text-amber-400 border-amber-500/40',
  LOW: 'text-blue-400 border-blue-500/40',
  INFO: 'text-slate-400 border-slate-500/40',
};

export function BreachPanel({ engagementId }: { engagementId?: string }) {
  const { data, loading, error } = useQuery<{ breachExposures: BreachExposureRow[] }>(
    BREACH_EXPOSURES_QUERY,
    {
      variables: { engagementId },
      skip: !engagementId,
      pollInterval: 4000,
      fetchPolicy: 'cache-and-network',
    },
  );

  const rows = data?.breachExposures ?? [];

  return (
    <Panel aria-label="osint-breach-exposure" className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">
        Fuites de données {rows.length ? `(${rows.length})` : ''}
      </h2>
      {error && (
        <p role="alert" className="text-sm text-red-400">
          {error.message}
        </p>
      )}
      {!engagementId ? (
        <p className="text-sm text-slate-500">Sélectionne un périmètre.</p>
      ) : !error && rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {loading ? 'Chargement…' : 'Aucune fuite de données trouvée pour l’instant.'}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r) => (
            <li key={r.id} className="space-y-0.5 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className={`rounded-full border px-2 py-0.5 font-semibold ${
                    SEV_COLOR[r.severity] ?? SEV_COLOR.INFO
                  }`}
                >
                  {r.severity}
                </span>
                {r.passwordExposed && (
                  <span className="rounded-full border border-red-500/40 px-2 py-0.5 font-semibold text-red-400">
                    🔑 password
                  </span>
                )}
                <span className="truncate font-mono text-slate-200">{r.breachName}</span>
                <span className="ml-auto truncate text-slate-400">{r.seed}</span>
              </div>
              <p className="pl-1 text-slate-500">
                {r.dataClasses.join(' · ') || '—'} · {r.source} · vu {formatDate(r.lastSeenAt)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
