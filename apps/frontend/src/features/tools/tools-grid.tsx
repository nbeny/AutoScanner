import { useQuery } from '@apollo/client';
import { TOOL_ACTIVITY_QUERY } from '../../lib/graphql/queries';
import { scannerCategory, SCANNER_CATALOG } from '../scans/scanner-catalog';
import { SEVERITY_COLORS, SEVERITY_ORDER } from '../../components/charts/chart-theme';
import { formatDate } from '../../lib/format-date';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface FindingsBySeverity {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

interface ToolActivityItem {
  scannerName: string;
  totalExecutions: number;
  successCount: number;
  failureCount: number;
  medianDurationMs?: number | null;
  totalFindings: number;
  lastRunAt?: string | null;
  findingsBySeverity: FindingsBySeverity;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ToolsGridProps {
  engagementId?: string;
  onSelectTool?: (scannerName: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function successRate(successCount: number, totalExecutions: number): string {
  if (totalExecutions === 0) return '—';
  return `${Math.round((successCount / totalExecutions) * 100)}%`;
}

// ---------------------------------------------------------------------------
// Severity mini-bar (mirrors vulnerabilities-view SeverityBar pattern)
// ---------------------------------------------------------------------------

function SeverityMiniBar({ findings }: { findings: FindingsBySeverity }) {
  const total = SEVERITY_ORDER.reduce((sum, sev) => sum + (findings[sev] ?? 0), 0);
  if (total === 0) return <span className="text-xs text-slate-500">—</span>;

  return (
    <span className="flex h-2 w-20 overflow-hidden rounded-full">
      {SEVERITY_ORDER.map((sev) => {
        const count = findings[sev] ?? 0;
        if (count === 0) return null;
        const pct = (count / total) * 100;
        return (
          <span
            key={sev}
            style={{ width: `${pct}%`, backgroundColor: SEVERITY_COLORS[sev] }}
            title={`${sev}: ${count}`}
          />
        );
      })}
    </span>
  );
}

// ---------------------------------------------------------------------------
// ToolCard
// ---------------------------------------------------------------------------

function ToolCard({
  item,
  onSelectTool,
}: {
  item: ToolActivityItem;
  onSelectTool?: (scannerName: string) => void;
}) {
  const category = scannerCategory(item.scannerName);

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={item.scannerName}
      onClick={() => onSelectTool?.(item.scannerName)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelectTool?.(item.scannerName);
      }}
      className="rounded-lg border border-slate-700 bg-slate-800 p-4 cursor-pointer hover:border-indigo-500 hover:bg-slate-750 transition-colors space-y-2"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-slate-100 text-sm">{item.scannerName}</span>
        <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">
          {category}
        </span>
      </div>

      {/* Stats row */}
      <div className="flex flex-wrap gap-3 text-xs text-slate-400">
        <span>
          <span className="text-slate-200 font-medium">{item.totalExecutions}</span> exéc.
        </span>
        <span>
          <span className="text-slate-200 font-medium">
            {successRate(item.successCount, item.totalExecutions)}
          </span>{' '}
          succès
        </span>
        <span>
          <span className="text-slate-200 font-medium">
            {formatDuration(item.medianDurationMs)}
          </span>{' '}
          médiane
        </span>
      </div>

      {/* Findings row */}
      <div className="flex items-center gap-3">
        <span className="text-xs text-slate-400">
          Findings: <span className="text-slate-200 font-medium">{item.totalFindings}</span>
        </span>
        <SeverityMiniBar findings={item.findingsBySeverity} />
      </div>

      {/* Last run */}
      <div className="text-xs text-slate-500">
        Dernier: {item.lastRunAt ? formatDate(item.lastRunAt) : '—'}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Category ordering: follow SCANNER_CATALOG key order, then 'Other' at end
// ---------------------------------------------------------------------------

const CATEGORY_ORDER = [...Object.keys(SCANNER_CATALOG), 'Other'];

function categoryOrder(cat: string): number {
  const idx = CATEGORY_ORDER.indexOf(cat);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

// ---------------------------------------------------------------------------
// ToolsGrid
// ---------------------------------------------------------------------------

export function ToolsGrid({ engagementId, onSelectTool }: ToolsGridProps = {}) {
  const { data, loading, error } = useQuery<{ toolActivity: ToolActivityItem[] }>(
    TOOL_ACTIVITY_QUERY,
    { variables: { engagementId: engagementId ?? null } },
  );

  const tools = data?.toolActivity ?? [];

  // Group by category
  const grouped = new Map<string, ToolActivityItem[]>();
  for (const item of tools) {
    const cat = scannerCategory(item.scannerName);
    if (!grouped.has(cat)) grouped.set(cat, []);
    grouped.get(cat)!.push(item);
  }

  // Sort categories by catalog order
  const sortedCategories = [...grouped.entries()].sort(
    ([a], [b]) => categoryOrder(a) - categoryOrder(b),
  );

  // Within each category, sort by totalFindings desc
  for (const [, items] of sortedCategories) {
    items.sort((a, b) => b.totalFindings - a.totalFindings);
  }

  return (
    <div aria-label="tools-grid" className="space-y-6">
      {loading && <p className="text-slate-400 text-sm">Chargement…</p>}
      {error && (
        <p className="text-red-400" role="alert">
          {error.message}
        </p>
      )}
      {!loading && !error && tools.length === 0 && (
        <p className="text-slate-500 text-sm">Aucun outil actif.</p>
      )}
      {sortedCategories.map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {category}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((item) => (
              <ToolCard key={item.scannerName} item={item} onSelectTool={onSelectTool} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
