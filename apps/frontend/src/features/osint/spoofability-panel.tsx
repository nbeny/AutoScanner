import { useQuery } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { ORG_METADATA_QUERY } from '../../lib/graphql/queries';
import { orgMetaMatchesFocus, type InvestigationFocus } from './seed-match';

interface OrgMetadataRow {
  id: string;
  kind: string;
  source: string;
  data: unknown;
  lastSeenAt: string;
}

/** Compact one-line summary of an org-metadata JSON blob (SPF/DMARC/etc.). */
function summarize(data: unknown): string {
  if (!data || typeof data !== 'object') return '';
  const obj = data as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ['spf', 'dmarc', 'dkim', 'spoofable', 'registrant', 'registrar']) {
    if (obj[key] !== undefined && obj[key] !== null) {
      parts.push(`${key}: ${String(obj[key])}`);
    }
  }
  return parts.join(' · ');
}

export function SpoofabilityPanel({
  engagementId,
  focus = null,
}: {
  engagementId?: string;
  focus?: InvestigationFocus | null;
}) {
  const { data, loading } = useQuery<{ orgMetadata: OrgMetadataRow[] }>(ORG_METADATA_QUERY, {
    variables: { engagementId },
    skip: !engagementId,
    pollInterval: 4000,
    fetchPolicy: 'cache-and-network',
  });

  const rows = (data?.orgMetadata ?? []).filter((r) => orgMetaMatchesFocus(focus, r));

  return (
    <Panel aria-label="osint-spoofability" className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">
        Spoofabilité &amp; DNS mail {rows.length ? `(${rows.length})` : ''}
      </h2>
      {!engagementId ? (
        <p className="text-sm text-slate-500">Sélectionne un périmètre.</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">
          {loading ? 'Chargement…' : 'Aucune métadonnée pour l’instant.'}
        </p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => {
            const summary = summarize(r.data);
            return (
              <li key={r.id} className="flex items-center gap-2 text-xs">
                <span className="rounded-full border border-space-800 px-2 py-0.5 font-mono text-indigo-300">
                  {r.kind}
                </span>
                <span className="truncate text-slate-300">{summary || r.source}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
