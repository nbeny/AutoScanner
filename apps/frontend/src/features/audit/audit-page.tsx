import { useState } from 'react';
import { useScope } from '../../lib/scope-context';
import { useEngagementName } from '../../lib/use-engagement-name';
import { VulnerabilitiesView } from '../findings/vulnerabilities-view';
import { VulnerabilityDetailDrawer } from '../findings/vulnerability-detail-drawer';
import { SeveritySparklinePanel } from '../cockpit/severity-sparkline-panel';
import { RecentReportsPanel } from '../reports/recent-reports-panel';
import { GenerateReportButton } from '../reports/generate-report-button';
import { AuditPostureSummary } from './audit-posture-summary';

export function AuditPage({ engagementId: engagementIdProp }: { engagementId?: string } = {}) {
  const { engagementId: scoped } = useScope();
  // An explicit prop (e.g. the legacy `/engagements/:id/vulnerabilities` route
  // reading the id from the URL) overrides the ambient scope selector.
  const engagementId = engagementIdProp ?? scoped;
  const scope = engagementId ?? undefined;
  const name = useEngagementName(scope);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-8" aria-label="audit-page">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Audit / Bilan sécurité</h1>
        <code className="text-xs text-slate-400">
          {engagementId ? `périmètre ${name ?? engagementId.slice(0, 8)}` : 'Tous les périmètres'}
        </code>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <AuditPostureSummary engagementId={scope} />
        <SeveritySparklinePanel engagementId={scope} />
      </div>

      <section aria-label="audit-findings" className="space-y-2">
        <h2 className="text-lg font-semibold text-slate-200">Findings corrélés</h2>
        <VulnerabilitiesView engagementId={scope} onSelect={(id) => setSelectedId(id)} />
      </section>

      <section aria-label="audit-reports" className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-200">Rapports</h2>
          {engagementId ? (
            <span aria-label="report-generate">
              <GenerateReportButton engagementId={engagementId} />
            </span>
          ) : (
            <span className="text-xs text-slate-500">
              Sélectionne un périmètre pour générer un rapport.
            </span>
          )}
        </div>
        <RecentReportsPanel engagementId={scope} />
      </section>

      <VulnerabilityDetailDrawer
        correlatedFindingId={selectedId}
        engagementId={scope}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
