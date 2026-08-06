import { useQuery } from '@apollo/client';
import { SCANNER_CATALOG_QUERY, TOOL_ACTIVITY_QUERY } from '../../lib/graphql/queries';
import {
  groupForCategories,
  type Category,
  type ScannerCatalogEntry,
} from '../scans/scanner-catalog';
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

/** A catalogue entry merged with its (possibly absent) activity stats. */
interface MergedTool {
  scannerName: string;
  displayName: string;
  category: Category;
  requiresCredential: string | null;
  activity: ToolActivityItem | null;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface ToolsGridProps {
  engagementId?: string;
  onSelectTool?: (scannerName: string) => void;
  onLaunch?: (scannerName: string) => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_ORDER: Category[] = [
  'DNS/Subdomains',
  'Ports/Network',
  'Web/HTTP',
  'TLS',
  'OSINT',
  'Cloud',
  'Active Directory',
  'Vuln/Exploit',
  'Other',
];

function categoryOrder(cat: string): number {
  const idx = CATEGORY_ORDER.indexOf(cat as Category);
  return idx === -1 ? CATEGORY_ORDER.length : idx;
}

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
  tool,
  onSelectTool,
  onLaunch,
}: {
  tool: MergedTool;
  onSelectTool?: (scannerName: string) => void;
  onLaunch?: (scannerName: string) => void;
}) {
  const { activity } = tool;
  const neverRun = activity == null || activity.totalExecutions === 0;

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={tool.scannerName}
      onClick={() => onSelectTool?.(tool.scannerName)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onSelectTool?.(tool.scannerName);
      }}
      className="rounded-lg border border-slate-700 bg-slate-800 p-4 cursor-pointer hover:border-indigo-500 hover:bg-slate-750 transition-colors space-y-2"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold text-slate-100 text-sm">{tool.scannerName}</span>
        <span className="shrink-0 rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-400">
          {tool.category}
        </span>
      </div>

      {tool.requiresCredential ? (
        <span className="inline-block rounded bg-amber-900/50 px-1.5 py-0.5 text-[10px] text-amber-300">
          clé API : {tool.requiresCredential}
        </span>
      ) : null}

      {/* Stats row */}
      {neverRun ? (
        <p className="text-xs text-slate-500">Jamais exécuté</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 text-xs text-slate-400">
            <span>
              <span className="text-slate-200 font-medium">{activity.totalExecutions}</span> exéc.
            </span>
            <span>
              <span className="text-slate-200 font-medium">
                {successRate(activity.successCount, activity.totalExecutions)}
              </span>{' '}
              succès
            </span>
            <span>
              <span className="text-slate-200 font-medium">
                {formatDuration(activity.medianDurationMs)}
              </span>{' '}
              médiane
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-400">
              Findings: <span className="text-slate-200 font-medium">{activity.totalFindings}</span>
            </span>
            <SeverityMiniBar findings={activity.findingsBySeverity} />
          </div>

          <div className="text-xs text-slate-500">
            Dernier: {activity.lastRunAt ? formatDate(activity.lastRunAt) : '—'}
          </div>
        </>
      )}

      {onLaunch ? (
        <button
          type="button"
          aria-label={`launch-${tool.scannerName}`}
          onClick={(e) => {
            e.stopPropagation();
            onLaunch(tool.scannerName);
          }}
          className="mt-1 w-full rounded bg-indigo-600 hover:bg-indigo-500 py-1 text-xs font-medium text-white"
        >
          Lancer
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ToolsGrid
// ---------------------------------------------------------------------------

export function ToolsGrid({ engagementId, onSelectTool, onLaunch }: ToolsGridProps = {}) {
  const catalogQuery = useQuery<{ scannerCatalog: ScannerCatalogEntry[] }>(SCANNER_CATALOG_QUERY);
  const activityQuery = useQuery<{ toolActivity: ToolActivityItem[] }>(TOOL_ACTIVITY_QUERY, {
    variables: { engagementId: engagementId ?? null },
  });

  const loading = catalogQuery.loading || activityQuery.loading;
  const error = catalogQuery.error || activityQuery.error;

  const catalog = catalogQuery.data?.scannerCatalog ?? [];
  const activityByName = new Map<string, ToolActivityItem>();
  for (const item of activityQuery.data?.toolActivity ?? []) {
    activityByName.set(item.scannerName, item);
  }

  // Base list = full catalogue; left-join activity stats.
  const tools: MergedTool[] = catalog.map((entry) => ({
    scannerName: entry.name,
    displayName: entry.displayName,
    category: groupForCategories(entry.categories),
    requiresCredential: entry.requiresCredential,
    activity: activityByName.get(entry.name) ?? null,
  }));

  // Group by category.
  const grouped = new Map<string, MergedTool[]>();
  for (const tool of tools) {
    if (!grouped.has(tool.category)) grouped.set(tool.category, []);
    grouped.get(tool.category)!.push(tool);
  }

  const sortedCategories = [...grouped.entries()].sort(
    ([a], [b]) => categoryOrder(a) - categoryOrder(b),
  );

  // Within each category: run tools first (by findings desc), then never-run (by name).
  for (const [, items] of sortedCategories) {
    items.sort((a, b) => {
      const fa = a.activity?.totalFindings ?? -1;
      const fb = b.activity?.totalFindings ?? -1;
      if (fa !== fb) return fb - fa;
      return a.scannerName.localeCompare(b.scannerName);
    });
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
        <p className="text-slate-500 text-sm">Aucun outil.</p>
      )}
      {sortedCategories.map(([category, items]) => (
        <section key={category}>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500">
            {category}
          </h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {items.map((tool) => (
              <ToolCard
                key={tool.scannerName}
                tool={tool}
                onSelectTool={onSelectTool}
                onLaunch={onLaunch}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
