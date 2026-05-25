import { useQuery } from '@apollo/client';
import { ASSETS_QUERY } from '../../lib/graphql/queries';

interface AssetRow {
  id: string;
  value: string;
  type: string;
  lastSeenAt: string;
  ports?:
    | {
        number: number;
        protocol: string;
        state: string;
        services?: { name?: string | null; product?: string | null; version?: string | null }[];
      }[]
    | null;
}

export function AssetsTable({ engagementId }: { engagementId: string }) {
  const { data, loading, error, refetch } = useQuery<{ assets: AssetRow[] }>(ASSETS_QUERY, {
    variables: { engagementId },
  });

  if (loading) return <p className="text-slate-400 text-sm">Loading assets…</p>;
  if (error)
    return (
      <p className="text-red-400" role="alert">
        {error.message}
      </p>
    );

  const assets = data?.assets ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Assets ({assets.length})</h3>
        <button
          onClick={() => refetch()}
          className="text-xs text-indigo-400 hover:underline"
          type="button"
        >
          Refresh
        </button>
      </div>
      {assets.length === 0 ? (
        <p className="text-slate-500 text-sm">
          No assets yet. They will appear after the scan completes.
        </p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2">Asset</th>
              <th>Type</th>
              <th>Open ports</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id} className="border-t border-slate-800 align-top">
                <td className="py-2 font-mono">{a.value}</td>
                <td>{a.type}</td>
                <td>
                  {(a.ports ?? [])
                    .filter((p) => p.state === 'OPEN')
                    .map((p) => {
                      const svc = (p.services ?? [])[0];
                      const label = svc
                        ? `${svc.name ?? ''}${svc.product ? ` (${svc.product}${svc.version ? ` ${svc.version}` : ''})` : ''}`
                        : '';
                      return (
                        <div key={`${p.protocol}-${p.number}`} className="font-mono text-xs">
                          {p.number}/{p.protocol.toLowerCase()} {label}
                        </div>
                      );
                    })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
