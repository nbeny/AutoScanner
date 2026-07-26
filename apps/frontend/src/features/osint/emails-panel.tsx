import { useQuery } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { EMAILS_QUERY } from '../../lib/graphql/queries';

interface EmailRow {
  id: string;
  address: string;
  source: string;
  lastSeenAt: string;
}

export function EmailsPanel({ engagementId }: { engagementId?: string }) {
  const { data, loading } = useQuery<{ emails: EmailRow[] }>(EMAILS_QUERY, {
    variables: { engagementId },
    skip: !engagementId,
    pollInterval: 4000,
    fetchPolicy: 'cache-and-network',
  });

  const rows = data?.emails ?? [];

  return (
    <Panel aria-label="osint-emails" className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">
        Emails découverts {rows.length ? `(${rows.length})` : ''}
      </h2>
      {!engagementId ? (
        <p className="text-sm text-slate-500">Sélectionne un périmètre.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {loading ? 'Chargement…' : 'Aucun email pour l’instant.'}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              <span className="truncate font-mono text-slate-200">{r.address}</span>
              <span className="ml-auto text-slate-500">{r.source}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
