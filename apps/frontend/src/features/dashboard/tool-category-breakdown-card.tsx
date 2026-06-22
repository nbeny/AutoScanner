import { useQuery } from '@apollo/client';
import { TOOL_ACTIVITY_QUERY } from '../../lib/graphql/queries';
import { StackedBarChart } from '../../components/charts/stacked-bar-chart';
import { SEVERITY_COLORS, SEVERITY_ORDER } from '../../components/charts/chart-theme';
import { scannerCategory } from '../scans/scanner-catalog';

interface Props {
  engagementId?: string;
}

interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface ToolActivity {
  scannerName: string;
  findingsBySeverity: SeverityCounts;
}

export function ToolCategoryBreakdownCard({ engagementId }: Props = {}) {
  const { data, loading, error } = useQuery(TOOL_ACTIVITY_QUERY, {
    variables: { engagementId: engagementId ?? null },
  });

  if (loading) return <p className="text-slate-400 text-sm">Chargement…</p>;
  if (error)
    return (
      <p className="text-red-400 text-sm" role="alert">
        {error.message}
      </p>
    );

  const tools: ToolActivity[] = data?.toolActivity ?? [];

  // Aggregate findings by scanner category
  const buckets = new Map<
    string,
    { critical: number; high: number; medium: number; low: number; info: number }
  >();

  for (const tool of tools) {
    const category = scannerCategory(tool.scannerName);
    const existing = buckets.get(category) ?? {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    const sev = tool.findingsBySeverity;
    buckets.set(category, {
      critical: existing.critical + (sev.critical ?? 0),
      high: existing.high + (sev.high ?? 0),
      medium: existing.medium + (sev.medium ?? 0),
      low: existing.low + (sev.low ?? 0),
      info: existing.info + (sev.info ?? 0),
    });
  }

  const rows = [...buckets.entries()].map(([label, counts]) => ({
    label,
    ...counts,
  }));

  return (
    <div aria-label="tool-category-card" className="bg-slate-900 rounded p-4">
      <h3 className="text-lg font-semibold mb-3">Findings par catégorie d'outil</h3>
      {rows.length === 0 ? (
        <p className="text-slate-400 text-sm">Aucune donnée disponible.</p>
      ) : (
        <StackedBarChart
          rows={rows}
          keys={[...SEVERITY_ORDER]}
          colors={SEVERITY_COLORS}
          width={600}
          height={240}
        />
      )}
    </div>
  );
}
