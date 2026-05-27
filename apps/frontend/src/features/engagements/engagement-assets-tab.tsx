import { useQuery } from '@apollo/client';
import { ASSETS_QUERY } from '../../lib/graphql/queries';

export type AssetKind = 'DOMAIN' | 'SUBDOMAIN' | 'IP' | 'TECHNOLOGY';

interface TechnologyRow {
  id: string;
  name: string;
  version?: string | null;
}

interface AssetRow {
  id: string;
  value: string;
  type: string;
  lastSeenAt: string;
  technologies?: TechnologyRow[] | null;
}

// Map the user-facing tab key to the Prisma AssetType value.
const KIND_TO_TYPE: Record<Exclude<AssetKind, 'TECHNOLOGY'>, string> = {
  DOMAIN: 'DOMAIN',
  SUBDOMAIN: 'SUBDOMAIN',
  IP: 'IP_ADDRESS',
};

const KIND_LABEL: Record<AssetKind, string> = {
  DOMAIN: 'Domains',
  SUBDOMAIN: 'Subdomains',
  IP: 'IPs',
  TECHNOLOGY: 'Technologies',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return iso;
  }
}

export function EngagementAssetsTab({
  engagementId,
  kind,
}: {
  engagementId: string;
  kind: AssetKind;
}) {
  const { data, loading, error, refetch } = useQuery<{ assets: AssetRow[] }>(ASSETS_QUERY, {
    variables: { engagementId },
  });

  if (loading)
    return <p className="text-slate-400 text-sm">Loading {KIND_LABEL[kind].toLowerCase()}…</p>;
  if (error)
    return (
      <p className="text-red-400" role="alert">
        {error.message}
      </p>
    );

  const assets = data?.assets ?? [];

  if (kind === 'TECHNOLOGY') {
    // Flatten across assets; dedup by `${name}@${version ?? ''}`.
    const map = new Map<string, TechnologyRow>();
    for (const a of assets) {
      for (const t of a.technologies ?? []) {
        const key = `${t.name}@${t.version ?? ''}`;
        if (!map.has(key)) map.set(key, t);
      }
    }
    const techs = Array.from(map.values());
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">Technologies ({techs.length})</h3>
          <button
            onClick={() => refetch()}
            className="text-xs text-indigo-400 hover:underline"
            type="button"
          >
            Refresh
          </button>
        </div>
        {techs.length === 0 ? (
          <p className="text-slate-500 text-sm">No technologies yet.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-slate-400 text-left">
              <tr>
                <th className="py-2">Name</th>
                <th>Version</th>
              </tr>
            </thead>
            <tbody>
              {techs.map((t) => (
                <tr key={t.id} className="border-t border-slate-800">
                  <td className="py-2 font-mono">{t.name}</td>
                  <td className="font-mono text-xs">{t.version ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  const targetType = KIND_TO_TYPE[kind];
  const filtered = assets.filter((a) => a.type === targetType);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          {KIND_LABEL[kind]} ({filtered.length})
        </h3>
        <button
          onClick={() => refetch()}
          className="text-xs text-indigo-400 hover:underline"
          type="button"
        >
          Refresh
        </button>
      </div>
      {filtered.length === 0 ? (
        <p className="text-slate-500 text-sm">No {KIND_LABEL[kind].toLowerCase()} yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2">Value</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((a) => (
              <tr key={a.id} className="border-t border-slate-800">
                <td className="py-2 font-mono">{a.value}</td>
                <td className="text-xs text-slate-400">{formatDate(a.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
