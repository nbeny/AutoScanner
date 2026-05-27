import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { EngagementAssetsTab } from './engagement-assets-tab';
import { FindingsTable } from '../findings/findings-table';

type TabKey = 'overview' | 'domains' | 'subdomains' | 'ips' | 'technologies' | 'findings';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'domains', label: 'Domains' },
  { key: 'subdomains', label: 'Subdomains' },
  { key: 'ips', label: 'IPs' },
  { key: 'technologies', label: 'Technologies' },
  { key: 'findings', label: 'Findings' },
];

export function EngagementPage() {
  const { engagementId } = useParams<{ engagementId: string }>();
  const [tab, setTab] = useState<TabKey>('overview');

  if (!engagementId) return <p className="p-8">Missing engagement id.</p>;

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Engagement</h1>
        <code className="text-xs text-slate-400">engagement {engagementId}</code>
      </header>

      <nav className="flex gap-2 border-b border-slate-800" aria-label="engagement-tabs">
        {TABS.map((t) => {
          const active = tab === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={active ? 'page' : undefined}
              className={
                'px-3 py-2 text-sm border-b-2 -mb-px transition-colors ' +
                (active
                  ? 'border-indigo-400 text-indigo-300'
                  : 'border-transparent text-slate-400 hover:text-slate-200')
              }
            >
              {t.label}
            </button>
          );
        })}
      </nav>

      <section>
        {tab === 'overview' ? (
          <div className="space-y-3 bg-slate-900 rounded p-4">
            <p className="text-sm text-slate-300">
              Use the tabs above to explore assets and findings, or run a scan.
            </p>
            <Link
              to={`/engagements/${engagementId}/scans`}
              className="text-indigo-400 hover:underline text-sm"
            >
              Run scans →
            </Link>
          </div>
        ) : null}
        {tab === 'domains' ? (
          <EngagementAssetsTab engagementId={engagementId} kind="DOMAIN" />
        ) : null}
        {tab === 'subdomains' ? (
          <EngagementAssetsTab engagementId={engagementId} kind="SUBDOMAIN" />
        ) : null}
        {tab === 'ips' ? <EngagementAssetsTab engagementId={engagementId} kind="IP" /> : null}
        {tab === 'technologies' ? (
          <EngagementAssetsTab engagementId={engagementId} kind="TECHNOLOGY" />
        ) : null}
        {tab === 'findings' ? <FindingsTable engagementId={engagementId} /> : null}
      </section>
    </div>
  );
}
