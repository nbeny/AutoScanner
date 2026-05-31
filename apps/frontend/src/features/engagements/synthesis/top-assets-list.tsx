import { useQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { TOP_ASSETS_QUERY } from '../../../lib/graphql/queries';

type AssetKind =
  | 'DOMAIN'
  | 'SUBDOMAIN'
  | 'IP_ADDRESS'
  | 'URL'
  | 'HOSTNAME'
  | 'NETWORK'
  | 'CLOUD_RESOURCE'
  | 'CONTAINER'
  | 'WIFI_AP';

interface TopAsset {
  id: string;
  kind: AssetKind;
  canonicalValue: string;
  firstSeenAt: string;
  lastSeenAt: string;
  findingsCount: number;
  criticalCount: number;
  highCount: number;
}

export function TopAssetsList({
  engagementId,
  limit = 10,
}: {
  engagementId: string;
  limit?: number;
}) {
  const navigate = useNavigate();
  const { data, loading, error } = useQuery<{ topAssets: TopAsset[] }>(TOP_ASSETS_QUERY, {
    variables: { engagementId, limit },
  });

  if (loading) return <p className="text-slate-400 text-sm">Loading top assets…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const items = data?.topAssets ?? [];
  if (items.length === 0) {
    return (
      <section className="bg-slate-900 rounded p-4">
        <h3 className="text-lg font-semibold mb-2">Top assets</h3>
        <p className="text-slate-500 text-sm">No assets yet.</p>
      </section>
    );
  }

  return (
    <section className="bg-slate-900 rounded p-4" aria-label="top-assets">
      <h3 className="text-lg font-semibold mb-3">Top assets</h3>
      <ul className="space-y-2">
        {items.map((a) => (
          <li
            key={a.id}
            onClick={() => navigate(`/engagements/${engagementId}/assets/${a.id}`)}
            className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0 flex items-center gap-3 cursor-pointer hover:bg-slate-800/40 rounded px-1"
          >
            <span className="text-[10px] uppercase tracking-wide bg-slate-800 text-slate-300 rounded px-1.5 py-0.5">
              {a.kind}
            </span>
            <span className="font-mono text-sm text-slate-100 truncate">{a.canonicalValue}</span>
            <span className="ml-auto flex gap-1 items-center text-xs">
              {a.criticalCount > 0 ? (
                <span className="bg-red-700 text-red-50 rounded px-1.5 py-0.5">
                  {a.criticalCount} crit
                </span>
              ) : null}
              {a.highCount > 0 ? (
                <span className="bg-orange-600 text-orange-50 rounded px-1.5 py-0.5">
                  {a.highCount} high
                </span>
              ) : null}
              <span className="text-slate-400">{a.findingsCount} total</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
