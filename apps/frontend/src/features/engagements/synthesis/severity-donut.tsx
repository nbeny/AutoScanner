import { useQuery } from '@apollo/client';
import { ENGAGEMENT_OVERVIEW_QUERY } from '../../../lib/graphql/queries';
import { SeverityDonutChart, type SeverityCounts } from '../../../components/severity-donut-chart';

interface Overview {
  findingsBySeverity: SeverityCounts;
}

export function SeverityDonut({ engagementId }: { engagementId: string }) {
  const { data, loading, error } = useQuery<{ engagementOverview: Overview }>(
    ENGAGEMENT_OVERVIEW_QUERY,
    { variables: { engagementId } },
  );

  if (loading) return <p className="text-slate-400 text-sm">Loading severity…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const c = data?.engagementOverview.findingsBySeverity;
  if (!c) return null;

  return <SeverityDonutChart counts={c} />;
}
