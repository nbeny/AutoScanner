import { useQuery } from '@apollo/client';
import { COVERAGE_SUMMARY_QUERY } from '../../lib/graphql/queries';

interface Props {
  engagementId?: string;
}

export function CoverageKpiCard({ engagementId }: Props = {}) {
  const { data, loading, error } = useQuery(COVERAGE_SUMMARY_QUERY, {
    variables: { engagementId: engagementId ?? null },
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
    <div aria-label="coverage-kpi-card" className="bg-slate-900 rounded p-4">
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
