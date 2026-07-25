import { useQuery } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { Sparkline } from '../../components/ui/sparkline';
import { SEVERITY_TREND_QUERY } from '../../lib/graphql/queries';

interface Bucket {
  bucketDate: string;
  counts: { critical: number; high: number; medium: number; low: number; info: number };
}

export function SeveritySparklinePanel({ engagementId }: { engagementId?: string }) {
  const { data } = useQuery<{ severityTrend: Bucket[] }>(SEVERITY_TREND_QUERY, {
    variables: { engagementId, range: undefined },
    fetchPolicy: 'cache-and-network',
  });
  const buckets = data?.severityTrend ?? [];
  const values = buckets.map(
    (b) => b.counts.critical + b.counts.high + b.counts.medium + b.counts.low + b.counts.info,
  );

  return (
    <Panel aria-label="severity-trend" className="space-y-2">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">Tendance sévérité</h2>
      <Sparkline values={values} aria-label="severity-sparkline" />
    </Panel>
  );
}
