import { useApolloClient } from '@apollo/client';
import { DashboardOverview } from './dashboard-overview';
import { RecentActivityFeed } from './recent-activity-feed';
import { EngagementSummaryGrid } from './engagement-summary-grid';
import {
  ENGAGEMENT_SUMMARIES_QUERY,
  GLOBAL_OVERVIEW_QUERY,
  RECENT_ACTIVITY_QUERY,
} from '../../lib/graphql/queries';

export function DashboardPage() {
  const client = useApolloClient();

  function refresh() {
    void client.refetchQueries({
      include: [GLOBAL_OVERVIEW_QUERY, RECENT_ACTIVITY_QUERY, ENGAGEMENT_SUMMARIES_QUERY],
    });
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <button
          type="button"
          onClick={refresh}
          className="text-sm bg-slate-800 hover:bg-slate-700 rounded px-3 py-1.5"
        >
          Refresh
        </button>
      </header>

      <DashboardOverview />

      <RecentActivityFeed />

      <EngagementSummaryGrid />
    </div>
  );
}
