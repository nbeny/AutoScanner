import { Link } from 'react-router-dom';
import { AttackSurfaceCounters } from './attack-surface-counters';
import { RecentRunsTimeline } from './recent-runs-timeline';
import { SeverityDonut } from './severity-donut';
import { TopAssetsList } from './top-assets-list';
import { TopFindingsList } from './top-findings-list';
import { GenerateReportButton } from '../../reports/generate-report-button';
import { RecentReportsPanel } from '../../reports/recent-reports-panel';
import { EngagementTrendPanel } from './engagement-trend-panel';

export function EngagementSynthesisPage({ engagementId }: { engagementId: string }) {
  return (
    <div className="space-y-6">
      <div className="flex justify-end items-center gap-3">
        <GenerateReportButton engagementId={engagementId} />
        <Link
          to={`/engagements/${engagementId}/scans`}
          className="text-indigo-400 hover:underline text-sm"
        >
          Run scans →
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div aria-label="attack-surface-counters-container">
          <h3 className="text-lg font-semibold mb-3">Attack surface</h3>
          <AttackSurfaceCounters engagementId={engagementId} />
        </div>
        <div aria-label="severity-donut-container">
          <h3 className="text-lg font-semibold mb-3">Findings by severity</h3>
          <SeverityDonut engagementId={engagementId} />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div aria-label="top-findings-container">
          <TopFindingsList engagementId={engagementId} />
        </div>
        <div aria-label="top-assets-container">
          <TopAssetsList engagementId={engagementId} />
        </div>
      </div>

      <div aria-label="recent-template-runs-container">
        <RecentRunsTimeline engagementId={engagementId} />
      </div>

      <div aria-label="recent-reports-container">
        <RecentReportsPanel engagementId={engagementId} />
      </div>

      <div aria-label="engagement-trend-panel-container">
        <EngagementTrendPanel engagementId={engagementId} />
      </div>
    </div>
  );
}
