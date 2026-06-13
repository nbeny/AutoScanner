import { useQuery } from '@apollo/client';
import { ENDPOINTS_QUERY } from '../../lib/graphql/queries';

interface EndpointRow {
  id: string;
  url: string;
  method: string;
  statusCode?: number | null;
  contentLength?: number | null;
  source: string;
  lastSeenAt: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return iso;
  }
}

export function EngagementEndpointsTab({ engagementId }: { engagementId: string }) {
  const { data, loading, error } = useQuery<{ endpoints: EndpointRow[] }>(ENDPOINTS_QUERY, {
    variables: { engagementId },
  });

  if (loading) return <p className="text-slate-400 text-sm">Loading endpoints…</p>;
  if (error)
    return (
      <p className="text-red-400" role="alert">
        {error.message}
      </p>
    );

  const endpoints = data?.endpoints ?? [];

  if (endpoints.length === 0) {
    return <p className="text-slate-500 text-sm">No endpoints yet.</p>;
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Endpoints ({endpoints.length})</h3>
      <table className="w-full text-sm">
        <thead className="text-slate-400 text-left">
          <tr>
            <th className="py-2">URL</th>
            <th>Method</th>
            <th>Status</th>
            <th>Length</th>
            <th>Source</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {endpoints.map((e) => (
            <tr key={e.id} className="border-t border-slate-800">
              <td className="py-2 font-mono">{e.url}</td>
              <td className="font-mono text-xs uppercase">{e.method}</td>
              <td className="font-mono text-xs">{e.statusCode ?? '—'}</td>
              <td className="font-mono text-xs">{e.contentLength ?? '—'}</td>
              <td className="text-xs text-slate-400">{e.source}</td>
              <td className="text-xs text-slate-400">{formatDate(e.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
