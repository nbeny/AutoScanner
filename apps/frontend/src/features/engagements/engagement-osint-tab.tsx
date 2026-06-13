import { useQuery } from '@apollo/client';
import { EMAILS_QUERY, ORG_METADATA_QUERY } from '../../lib/graphql/queries';

interface EmailRow {
  id: string;
  address: string;
  source: string;
  lastSeenAt: string;
}

interface OrgMetadataRow {
  id: string;
  kind: string;
  source: string;
  data: unknown;
  lastSeenAt: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return iso;
  }
}

export function EngagementOsintTab({ engagementId }: { engagementId: string }) {
  const emails = useQuery<{ emails: EmailRow[] }>(EMAILS_QUERY, {
    variables: { engagementId },
  });
  const orgMeta = useQuery<{ orgMetadata: OrgMetadataRow[] }>(ORG_METADATA_QUERY, {
    variables: { engagementId },
  });

  return (
    <div className="space-y-8">
      <EmailsSection
        loading={emails.loading}
        error={emails.error?.message}
        rows={emails.data?.emails ?? []}
      />
      <OrgMetadataSection
        loading={orgMeta.loading}
        error={orgMeta.error?.message}
        rows={orgMeta.data?.orgMetadata ?? []}
      />
    </div>
  );
}

function EmailsSection({
  loading,
  error,
  rows,
}: {
  loading: boolean;
  error?: string;
  rows: EmailRow[];
}) {
  if (loading) return <p className="text-slate-400 text-sm">Loading emails…</p>;
  if (error)
    return (
      <p className="text-red-400" role="alert">
        {error}
      </p>
    );
  if (rows.length === 0) return <p className="text-slate-500 text-sm">No emails found.</p>;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Emails ({rows.length})</h3>
      <table className="w-full text-sm">
        <thead className="text-slate-400 text-left">
          <tr>
            <th className="py-2">Address</th>
            <th>Source</th>
            <th>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className="border-t border-slate-800">
              <td className="py-2 font-mono">{e.address}</td>
              <td className="text-xs text-slate-400">{e.source}</td>
              <td className="text-xs text-slate-400">{formatDate(e.lastSeenAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function OrgMetadataSection({
  loading,
  error,
  rows,
}: {
  loading: boolean;
  error?: string;
  rows: OrgMetadataRow[];
}) {
  if (loading) return <p className="text-slate-400 text-sm">Loading org metadata…</p>;
  if (error)
    return (
      <p className="text-red-400" role="alert">
        {error}
      </p>
    );
  if (rows.length === 0) return <p className="text-slate-500 text-sm">No org metadata found.</p>;

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Org Metadata ({rows.length})</h3>
      <div className="space-y-4">
        {rows.map((m) => (
          <div key={m.id} className="border border-slate-800 rounded p-4 space-y-2">
            <div className="flex items-center gap-4 text-sm">
              <span className="font-mono text-indigo-300">{m.kind}</span>
              <span className="text-slate-400 text-xs">{m.source}</span>
              <span className="text-slate-500 text-xs ml-auto">{formatDate(m.lastSeenAt)}</span>
            </div>
            <pre className="text-xs text-slate-300 bg-slate-900 rounded p-2 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(m.data, null, 2)}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
