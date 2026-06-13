import { useQuery, useMutation } from '@apollo/client';
import { CORRELATED_FINDINGS_QUERY, SET_FINDING_STATUS } from '../../lib/graphql/queries';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
type Severity = (typeof SEVERITIES)[number];

const FINDING_STATUSES = ['OPEN', 'TRIAGED', 'CONFIRMED', 'FALSE_POSITIVE', 'RESOLVED'] as const;
type FindingStatus = (typeof FINDING_STATUSES)[number];

interface CorrelatedFinding {
  id: string;
  title: string;
  severity: Severity;
  cveId?: string | null;
  status: FindingStatus;
  sourceCount: number;
  sources: string[];
  lastSeenAt: string;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: 'bg-red-700 text-red-50',
  HIGH: 'bg-orange-600 text-orange-50',
  MEDIUM: 'bg-yellow-600 text-yellow-50',
  LOW: 'bg-blue-600 text-blue-50',
  INFO: 'bg-slate-600 text-slate-50',
};

function formatDate(iso: string): string {
  try {
    return new Date(iso).toISOString().slice(0, 19).replace('T', ' ');
  } catch {
    return iso;
  }
}

export function CorrelatedFindingsView({ engagementId }: { engagementId: string }) {
  const { data, loading, error } = useQuery<{ correlatedFindings: CorrelatedFinding[] }>(
    CORRELATED_FINDINGS_QUERY,
    { variables: { engagementId } },
  );

  const [setFindingStatus] = useMutation(SET_FINDING_STATUS, {
    refetchQueries: [{ query: CORRELATED_FINDINGS_QUERY, variables: { engagementId } }],
  });

  const clusters = data?.correlatedFindings ?? [];

  function handleStatusChange(id: string, status: string) {
    void setFindingStatus({ variables: { id, status } });
  }

  return (
    <div className="space-y-3">
      <h3 className="text-lg font-semibold">Correlated Findings ({clusters.length})</h3>

      {loading ? <p className="text-slate-400 text-sm">Loading correlated findings…</p> : null}
      {error ? (
        <p className="text-red-400" role="alert">
          {error.message}
        </p>
      ) : null}

      {!loading && !error && clusters.length === 0 ? (
        <p className="text-slate-500 text-sm">No correlated findings yet.</p>
      ) : null}

      {clusters.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2">Severity</th>
              <th>Title</th>
              <th>CVE</th>
              <th>Sources</th>
              <th>Status</th>
              <th>Last seen</th>
            </tr>
          </thead>
          <tbody>
            {clusters.map((c) => (
              <tr key={c.id} className="border-t border-slate-800 align-top">
                <td className="py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                      SEVERITY_STYLE[c.severity] ?? SEVERITY_STYLE.INFO
                    }`}
                  >
                    {c.severity}
                  </span>
                </td>
                <td className="py-2">{c.title}</td>
                <td className="py-2 font-mono text-xs">{c.cveId ?? '—'}</td>
                <td className="py-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full bg-slate-700 px-2 py-0.5 text-xs"
                    aria-label={`sources: ${c.sources.join(', ')}`}
                  >
                    <span className="font-semibold">{c.sourceCount}</span>
                    <span className="text-slate-400">{c.sources.join(', ')}</span>
                  </span>
                </td>
                <td className="py-2">
                  <select
                    value={c.status}
                    onChange={(e) => handleStatusChange(c.id, e.target.value)}
                    aria-label={`status for ${c.title}`}
                    className="bg-slate-800 border border-slate-700 rounded text-xs text-slate-200 px-1 py-0.5"
                  >
                    {FINDING_STATUSES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="py-2 text-xs text-slate-400">{formatDate(c.lastSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
