import { useQuery } from '@apollo/client';
import { SEVERITY_TREND_QUERY } from '../../lib/graphql/queries';
import { TrendChart } from '../../components/charts/trend-chart';
import { SEVERITY_COLORS } from '../../components/charts/chart-theme';

interface Props {
  engagementId?: string;
}

export function SeverityTrendCard({ engagementId }: Props = {}) {
  const { data, loading, error } = useQuery(SEVERITY_TREND_QUERY, {
    variables: { engagementId: engagementId ?? null, range: { days: 30 } },
  });

  if (loading) return <p className="text-slate-400 text-sm">Chargement…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const rows: { bucketDate: string; counts: Record<string, number> }[] = data?.severityTrend ?? [];

  return (
    <div aria-label="severity-trend-card" className="bg-slate-900 rounded p-4">
      <h3 className="text-lg font-semibold mb-3">Tendance de sévérité (30j)</h3>
      {rows.length === 0 ? (
        <p className="text-slate-400 text-sm">Aucune donnée disponible.</p>
      ) : (
        <TrendChart
          rows={rows}
          keys={['critical', 'high', 'medium']}
          colors={SEVERITY_COLORS}
          width={600}
          height={240}
        />
      )}
    </div>
  );
}
