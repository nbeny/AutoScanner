import { useQuery } from '@apollo/client';
import { Link } from 'react-router-dom';
import { RECENT_ACTIVITY_QUERY } from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

type ActivityKind = 'TEMPLATE_RUN' | 'SCAN';

interface ActivityItem {
  id: string;
  kind: ActivityKind;
  engagementId: string;
  engagementName: string;
  label: string;
  status: string;
  ts: string;
}

const KIND_STYLE: Record<ActivityKind, string> = {
  TEMPLATE_RUN: 'bg-purple-700 text-purple-50',
  SCAN: 'bg-sky-700 text-sky-50',
};

const KIND_LABEL: Record<ActivityKind, string> = {
  TEMPLATE_RUN: 'TEMPLATE',
  SCAN: 'SCAN',
};

function statusStyle(status: string): string {
  if (status === 'COMPLETED') return 'text-emerald-300';
  if (status === 'FAILED' || status === 'TIMEOUT') return 'text-red-300';
  if (status === 'RUNNING' || status === 'QUEUED') return 'text-indigo-300';
  return 'text-slate-400';
}

export function RecentActivityFeed({ limit = 15 }: { limit?: number }) {
  const { data, loading, error } = useQuery<{ recentActivity: ActivityItem[] }>(
    RECENT_ACTIVITY_QUERY,
    { variables: { limit } },
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading activity…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const items = data?.recentActivity ?? [];

  return (
    <section className="bg-slate-900 rounded p-4" aria-label="recent-activity">
      <h3 className="text-lg font-semibold mb-3">Recent activity</h3>
      {items.length === 0 ? (
        <p className="text-slate-500 text-sm">No activity yet.</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li
              key={`${it.kind}:${it.id}`}
              className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0 flex items-center gap-3 flex-wrap"
            >
              <span
                className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${KIND_STYLE[it.kind]}`}
              >
                {KIND_LABEL[it.kind]}
              </span>
              <span className="font-mono text-sm text-slate-100">{it.label}</span>
              <Link
                to={`/engagements/${it.engagementId}`}
                className="text-xs text-indigo-400 hover:underline"
              >
                {it.engagementName}
              </Link>
              <span className={`text-xs font-semibold ${statusStyle(it.status)}`}>{it.status}</span>
              <span className="ml-auto text-xs text-slate-500">{formatDate(it.ts)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
