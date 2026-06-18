import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { ENGAGEMENT_SUMMARIES_QUERY } from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';
import type { SeverityCounts } from '../../components/severity-donut-chart';

type EngagementStatus = 'DRAFT' | 'ACTIVE' | 'PAUSED' | 'COMPLETED' | 'ARCHIVED';

interface EngagementSummary {
  id: string;
  name: string;
  clientName: string;
  status: EngagementStatus;
  createdAt: string;
  assetCount: number;
  lastActivityAt: string;
  findingsBySeverity: SeverityCounts;
}

const STATUS_STYLE: Record<EngagementStatus, string> = {
  DRAFT: 'bg-slate-700 text-slate-100',
  ACTIVE: 'bg-emerald-700 text-emerald-50',
  PAUSED: 'bg-amber-700 text-amber-50',
  COMPLETED: 'bg-indigo-700 text-indigo-50',
  ARCHIVED: 'bg-slate-600 text-slate-300',
};

const SEV_ORDER: (keyof SeverityCounts)[] = ['critical', 'high', 'medium', 'low', 'info'];
const SEV_COLOR: Record<keyof SeverityCounts, string> = {
  critical: '#b91c1c',
  high: '#ea580c',
  medium: '#ca8a04',
  low: '#2563eb',
  info: '#475569',
};

function SeverityBar({ counts }: { counts: SeverityCounts }) {
  const total = SEV_ORDER.reduce((sum, k) => sum + counts[k], 0);
  if (total === 0) {
    return <div className="text-xs text-slate-500">No findings</div>;
  }
  return (
    <div aria-label="severity-bar">
      <div className="flex h-2 rounded overflow-hidden bg-slate-800">
        {SEV_ORDER.filter((k) => counts[k] > 0).map((k) => (
          <span
            key={k}
            className="h-full"
            style={{ width: `${(counts[k] / total) * 100}%`, backgroundColor: SEV_COLOR[k] }}
            aria-label={`bar-${k}-${counts[k]}`}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-2 text-[0.65rem] text-slate-400">
        {counts.critical > 0 ? <span className="text-red-400">{counts.critical} crit</span> : null}
        {counts.high > 0 ? <span className="text-orange-400">{counts.high} high</span> : null}
        <span>{total} total</span>
      </div>
    </div>
  );
}

export function EngagementSummaryGrid() {
  const { data, loading, error } = useQuery<{ engagementSummaries: EngagementSummary[] }>(
    ENGAGEMENT_SUMMARIES_QUERY,
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading engagements…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const summaries = data?.engagementSummaries ?? [];

  if (summaries.length === 0) {
    return (
      <section aria-label="engagement-summary-grid">
        <h3 className="text-lg font-semibold mb-3">Engagements</h3>
        <div className="bg-slate-900 rounded p-6 text-center text-sm text-slate-400">
          No engagements yet.{' '}
          <Link to="/engagements" className="text-indigo-400 hover:underline">
            Create your first engagement →
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section aria-label="engagement-summary-grid">
      <h3 className="text-lg font-semibold mb-3">Engagements</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {summaries.map((s) => (
          <Link
            key={s.id}
            to={`/engagements/${s.id}`}
            className="bg-slate-900 rounded p-4 block hover:ring-1 hover:ring-indigo-500 transition"
            aria-label={`engagement-card-${s.id}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold text-slate-100">{s.name}</div>
                <div className="text-xs text-slate-400">{s.clientName}</div>
              </div>
              <span
                className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${STATUS_STYLE[s.status]}`}
              >
                {s.status}
              </span>
            </div>
            <div className="mt-3 text-xs text-slate-400">{s.assetCount} assets</div>
            <div className="mt-2">
              <SeverityBar counts={s.findingsBySeverity} />
            </div>
            <div className="mt-3 text-[0.65rem] text-slate-500">
              Last activity {formatDate(s.lastActivityAt)}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
