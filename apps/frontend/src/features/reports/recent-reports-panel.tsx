import { useEffect } from 'react';
import { useQuery } from '@apollo/client';
import { REPORTS_QUERY } from '../../lib/graphql/queries';

type ReportFormat = 'PDF' | 'CSV' | 'SARIF' | 'JSON';
type ReportStatus = 'PENDING' | 'GENERATING' | 'READY' | 'FAILED';

interface ReportRow {
  id: string;
  format: ReportFormat;
  status: ReportStatus;
  sizeBytes: number | null;
  contentType: string | null;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
  downloadUrl: string | null;
  template: { id: string; slug: string; name: string; format: ReportFormat };
}

const STATUS_STYLE: Record<ReportStatus, string> = {
  PENDING: 'bg-slate-700 text-slate-100',
  GENERATING: 'bg-indigo-700 text-indigo-50',
  READY: 'bg-emerald-700 text-emerald-50',
  FAILED: 'bg-red-700 text-red-50',
};

const FORMAT_STYLE: Record<ReportFormat, string> = {
  PDF: 'bg-purple-700 text-purple-50',
  CSV: 'bg-sky-700 text-sky-50',
  SARIF: 'bg-amber-700 text-amber-50',
  JSON: 'bg-slate-600 text-slate-50',
};

const POLL_INTERVAL_MS = 5000;
const KB = 1024;
const MB = 1024 * 1024;

function formatSize(n: number | null): string {
  if (n == null) return '—';
  if (n < KB) return `${n} B`;
  if (n < MB) return `${(n / KB).toFixed(1)} KB`;
  return `${(n / MB).toFixed(2)} MB`;
}

export function RecentReportsPanel({ engagementId }: { engagementId?: string }) {
  const { data, loading, error, startPolling, stopPolling } = useQuery<{ reports: ReportRow[] }>(
    REPORTS_QUERY,
    { variables: { engagementId } },
  );

  const reports = data?.reports ?? [];
  const hasInFlight = reports.some((r) => r.status === 'PENDING' || r.status === 'GENERATING');

  useEffect(() => {
    if (hasInFlight) {
      startPolling(POLL_INTERVAL_MS);
      return () => stopPolling();
    }
    stopPolling();
    return undefined;
  }, [hasInFlight, startPolling, stopPolling]);

  if (loading && reports.length === 0)
    return <p className="text-slate-400 text-sm">Loading reports…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  if (reports.length === 0) {
    return (
      <section className="bg-slate-900 rounded p-4" aria-label="recent-reports">
        <h3 className="text-lg font-semibold mb-2">Rapports récents</h3>
        <p className="text-slate-500 text-sm">Aucun rapport.</p>
      </section>
    );
  }

  return (
    <section className="bg-slate-900 rounded p-4" aria-label="recent-reports">
      <h3 className="text-lg font-semibold mb-3">Rapports récents</h3>
      <ul className="space-y-2">
        {reports.map((r) => (
          <li
            key={r.id}
            className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0 flex items-center gap-3 flex-wrap"
          >
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${FORMAT_STYLE[r.format]}`}
            >
              {r.format}
            </span>
            <span
              className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[r.status]}`}
            >
              {r.status}
            </span>
            <span className="text-sm text-slate-100">{r.template.name}</span>
            <span className="text-xs text-slate-400">{formatSize(r.sizeBytes)}</span>
            {r.status === 'READY' ? (
              <a
                href={`/reports/${r.id}/download`}
                target="_blank"
                rel="noopener"
                className="ml-auto text-indigo-300 hover:underline text-sm"
              >
                Télécharger
              </a>
            ) : null}
            {r.status === 'FAILED' && r.errorMessage ? (
              <span className="basis-full text-xs text-red-300" role="alert">
                {r.errorMessage}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
