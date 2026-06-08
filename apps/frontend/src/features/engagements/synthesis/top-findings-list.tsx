import { useQuery } from '@apollo/client';
import { TOP_FINDINGS_QUERY } from '../../../lib/graphql/queries';
import { CveInfoCell } from '../../assets/cve-info-cell';

type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';

interface TopFinding {
  dedupHash: string;
  title: string;
  severity: Severity;
  cveId: string | null;
  affectedAssetCount: number;
  scannerSources: string[];
  firstSeenAt: string;
  lastSeenAt: string;
  exampleAssetId: string;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: 'bg-red-700 text-red-50',
  HIGH: 'bg-orange-600 text-orange-50',
  MEDIUM: 'bg-yellow-600 text-yellow-50',
  LOW: 'bg-blue-600 text-blue-50',
  INFO: 'bg-slate-600 text-slate-50',
};

export function TopFindingsList({
  engagementId,
  limit = 10,
}: {
  engagementId: string;
  limit?: number;
}) {
  const { data, loading, error } = useQuery<{ topFindings: TopFinding[] }>(TOP_FINDINGS_QUERY, {
    variables: { engagementId, limit },
  });

  if (loading) return <p className="text-slate-400 text-sm">Loading top findings…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const items = data?.topFindings ?? [];
  if (items.length === 0) {
    return (
      <section className="bg-slate-900 rounded p-4">
        <h3 className="text-lg font-semibold mb-2">Top findings</h3>
        <p className="text-slate-500 text-sm">No findings yet.</p>
      </section>
    );
  }

  return (
    <section className="bg-slate-900 rounded p-4" aria-label="top-findings">
      <h3 className="text-lg font-semibold mb-3">Top findings</h3>
      <ul className="space-y-2">
        {items.map((f) => (
          <li
            key={f.dedupHash}
            className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[f.severity]}`}
              >
                {f.severity}
              </span>
              <span className="font-medium text-slate-100">{f.title}</span>
              {f.cveId ? (
                <>
                  <span className="font-mono text-xs text-slate-400">{f.cveId}</span>
                  <CveInfoCell cveId={f.cveId} />
                </>
              ) : null}
              <span className="text-xs text-slate-400 ml-auto">
                {f.affectedAssetCount === 1 ? '1 asset' : `${f.affectedAssetCount} assets`}
              </span>
            </div>
            <div className="flex gap-1 mt-1">
              {f.scannerSources.map((s) => (
                <span
                  key={s}
                  className="text-[10px] uppercase tracking-wide bg-slate-800 text-slate-300 rounded px-1.5 py-0.5"
                >
                  {s}
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
