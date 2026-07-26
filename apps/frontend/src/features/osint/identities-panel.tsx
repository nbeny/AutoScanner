import { useQuery } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { IDENTITIES_QUERY } from '../../lib/graphql/queries';
import { identityMatchesFocus, type InvestigationFocus } from './seed-match';

interface IdentityRow {
  id: string;
  kind: string;
  seed: string;
  service: string;
  url: string | null;
  source: string;
  lastSeenAt: string;
}

export function IdentitiesPanel({
  engagementId,
  focus = null,
}: {
  engagementId?: string;
  focus?: InvestigationFocus | null;
}) {
  const { data, loading } = useQuery<{ identities: IdentityRow[] }>(IDENTITIES_QUERY, {
    variables: { engagementId, seed: undefined },
    skip: !engagementId,
    pollInterval: 4000,
    fetchPolicy: 'cache-and-network',
  });

  const rows = (data?.identities ?? []).filter((r) => identityMatchesFocus(focus, r));

  return (
    <Panel aria-label="osint-identities" className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">
        Identités &amp; comptes {rows.length ? `(${rows.length})` : ''}
      </h2>
      {!engagementId ? (
        <p className="text-sm text-slate-500">Sélectionne un périmètre.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {loading ? 'Chargement…' : 'Aucun compte trouvé pour l’instant.'}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 text-xs">
              <span className="rounded-full border border-neon-magenta/40 px-2 py-0.5 font-mono text-neon-magenta">
                {r.service}
              </span>
              <span className="truncate text-slate-200">{r.seed}</span>
              {r.url ? (
                <a
                  href={r.url}
                  target="_blank"
                  rel="noreferrer"
                  className="ml-auto truncate text-slate-400 hover:text-slate-200 hover:underline"
                >
                  {r.url}
                </a>
              ) : (
                <span className="ml-auto text-slate-600">{r.source}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
