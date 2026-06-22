import { useQuery } from '@apollo/client';
import { SEVERITY_TREND_QUERY, COVERAGE_SUMMARY_QUERY } from '../../../lib/graphql/queries';
import { TrendChart } from '../../../components/charts/trend-chart';
import { SEVERITY_COLORS } from '../../../components/charts/chart-theme';

interface Props {
  engagementId: string;
}

function TrendSection({ engagementId }: Props) {
  const { data, loading, error } = useQuery(SEVERITY_TREND_QUERY, {
    variables: { engagementId, range: { days: 30 } },
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
    <div>
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

function CoverageSection({ engagementId }: Props) {
  const { data, loading, error } = useQuery(COVERAGE_SUMMARY_QUERY, {
    variables: { engagementId },
  });

  if (loading) return <p className="text-slate-400 text-sm">Chargement…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const summary = data?.coverageSummary;
  if (!summary) return null;

  const { totalAssets, scannedAssets, percent } = summary;

  return (
    <div>
      <h3 className="text-lg font-semibold mb-3">Couverture</h3>
      <div className="flex items-baseline gap-1 mb-2">
        <span className="text-3xl font-semibold text-slate-100">{scannedAssets}</span>
        <span className="text-slate-400 text-sm">/ </span>
        <span className="text-slate-400 text-sm">{totalAssets}</span>
        <span className="text-slate-400 text-sm"> assets</span>
      </div>
      <div
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="w-full bg-slate-800 rounded h-3 overflow-hidden mb-2"
      >
        <div
          className="h-full bg-blue-500 rounded transition-all"
          style={{ width: `${Math.min(100, percent)}%` }}
        />
      </div>
      <p className="text-sm text-slate-400">{percent}%</p>
    </div>
  );
}

export function EngagementTrendPanel({ engagementId }: Props) {
  return (
    <div
      aria-label="engagement-trend-panel"
      className="bg-slate-900 rounded p-4 grid grid-cols-1 md:grid-cols-2 gap-6"
    >
      <TrendSection engagementId={engagementId} />
      <CoverageSection engagementId={engagementId} />
    </div>
  );
}
