import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { ALL_CORRELATED_FINDINGS_QUERY } from '../../lib/graphql/queries';
import { groupVulns, severityBreakdown, type GroupAxis, type VulnRow } from './vuln-grouping';
import { SEVERITY_COLORS, SEVERITY_ORDER } from '../../components/charts/chart-theme';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
type Severity = (typeof SEVERITIES)[number];

const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: 'bg-red-700 text-red-50',
  HIGH: 'bg-orange-600 text-orange-50',
  MEDIUM: 'bg-yellow-600 text-yellow-50',
  LOW: 'bg-blue-600 text-blue-50',
  INFO: 'bg-slate-600 text-slate-50',
};

const STATUS_OPTIONS = ['OPEN', 'TRIAGED', 'CONFIRMED', 'FALSE_POSITIVE', 'RESOLVED'] as const;

type SortKey = 'risk' | 'severity' | 'recent';

const SEVERITY_RANK: Record<string, number> = {
  CRITICAL: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
  INFO: 4,
};

const AXIS_LABELS: { axis: GroupAxis; label: string }[] = [
  { axis: 'severity', label: 'Sévérité' },
  { axis: 'cve', label: 'CVE' },
  { axis: 'tool', label: 'Outil' },
  { axis: 'asset', label: 'Asset' },
  { axis: 'status', label: 'Statut' },
];

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface VulnerabilitiesViewProps {
  engagementId?: string;
  onSelect?: (correlatedFindingId: string) => void;
}

// ---------------------------------------------------------------------------
// Severity bar (pure CSS, no recharts)
// ---------------------------------------------------------------------------

function SeverityBar({ rows }: { rows: VulnRow[] }) {
  const breakdown = severityBreakdown(rows);
  const total = Object.values(breakdown).reduce((s, n) => s + n, 0);
  if (total === 0) return null;

  return (
    <span className="flex h-2 w-24 overflow-hidden rounded-full">
      {SEVERITY_ORDER.map((sev) => {
        const count = breakdown[sev] ?? 0;
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
// VulnerabilitiesView
// ---------------------------------------------------------------------------

export function VulnerabilitiesView({ engagementId, onSelect }: VulnerabilitiesViewProps) {
  // Query variables — only include engagementId if defined
  const filter = engagementId ? { engagementId } : {};

  const { data, loading, error } = useQuery<{
    allCorrelatedFindings: (VulnRow & { sourceCount?: number })[];
  }>(ALL_CORRELATED_FINDINGS_QUERY, {
    variables: { filter },
  });

  // Grouping axis
  const [axis, setAxis] = useState<GroupAxis>('severity');

  // Filters
  const [checkedSeverities, setCheckedSeverities] = useState<Set<Severity>>(
    () => new Set(SEVERITIES),
  );
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [cveOnly, setCveOnly] = useState(false);
  const [search, setSearch] = useState('');

  // Sort
  const [sortKey, setSortKey] = useState<SortKey>('risk');

  // Collapsed state per group
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  function toggleSeverity(s: Severity) {
    setCheckedSeverities((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  function toggleGroup(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const rawRows: VulnRow[] = useMemo(
    () =>
      (data?.allCorrelatedFindings ?? []).map((f) => ({
        id: f.id,
        engagementId: f.engagementId,
        title: f.title,
        severity: f.severity,
        cveId: f.cveId ?? null,
        status: f.status,
        sources: f.sources,
        riskScore: f.riskScore,
        assetId: f.assetId,
        assetValue: f.assetValue,
        lastSeenAt: f.lastSeenAt,
      })),
    [data],
  );

  // Client-side filtering
  const filteredRows = useMemo(() => {
    let rows = rawRows;

    // Severity filter
    if (checkedSeverities.size < SEVERITIES.length) {
      rows = rows.filter((r) => checkedSeverities.has(r.severity as Severity));
    }

    // Status filter
    if (statusFilter) {
      rows = rows.filter((r) => r.status === statusFilter);
    }

    // CVE only
    if (cveOnly) {
      rows = rows.filter((r) => Boolean(r.cveId));
    }

    // Text search
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) => r.title.toLowerCase().includes(q));
    }

    return rows;
  }, [rawRows, checkedSeverities, statusFilter, cveOnly, search]);

  // Sort before grouping
  const sortedRows = useMemo(() => {
    const rows = [...filteredRows];
    if (sortKey === 'risk') {
      rows.sort((a, b) => b.riskScore - a.riskScore);
    } else if (sortKey === 'severity') {
      rows.sort((a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));
    } else if (sortKey === 'recent') {
      rows.sort((a, b) => new Date(b.lastSeenAt).getTime() - new Date(a.lastSeenAt).getTime());
    }
    return rows;
  }, [filteredRows, sortKey]);

  const groups = useMemo(() => groupVulns(sortedRows, axis), [sortedRows, axis]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div aria-label="vulnerabilities-view" className="space-y-4">
      {/* Controls bar */}
      <div className="flex flex-wrap items-center gap-4">
        {/* Group axis buttons */}
        <div className="flex items-center gap-1" aria-label="vuln-group-axis">
          {AXIS_LABELS.map(({ axis: a, label }) => (
            <button
              key={a}
              type="button"
              onClick={() => setAxis(a)}
              className={`rounded px-3 py-1 text-xs font-medium transition-colors ${
                axis === a
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          aria-label="vuln-sort"
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as SortKey)}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
        >
          <option value="risk">Risque</option>
          <option value="severity">Sévérité</option>
          <option value="recent">Récent</option>
        </select>

        {/* Status filter */}
        <select
          aria-label="status-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200"
        >
          <option value="">Tous</option>
          {STATUS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Text search */}
        <input
          aria-label="vuln-search"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher…"
          className="rounded bg-slate-800 px-2 py-1 text-xs text-slate-200 placeholder-slate-500"
        />
      </div>

      {/* Severity checkboxes + CVE only */}
      <div className="flex flex-wrap items-center gap-3" aria-label="severity-filter">
        {SEVERITIES.map((s) => (
          <label key={s} className="flex items-center gap-1 text-xs text-slate-300">
            <input
              type="checkbox"
              checked={checkedSeverities.has(s)}
              onChange={() => toggleSeverity(s)}
              aria-label={s}
            />
            {s}
          </label>
        ))}
        <label className="flex items-center gap-1 text-xs text-slate-300">
          <input
            type="checkbox"
            checked={cveOnly}
            onChange={(e) => setCveOnly(e.target.checked)}
            aria-label="cve-only"
          />
          CVE seulement
        </label>
      </div>

      {/* States */}
      {loading ? <p className="text-slate-400 text-sm">Chargement…</p> : null}
      {error ? (
        <p className="text-red-400" role="alert">
          {error.message}
        </p>
      ) : null}
      {!loading && !error && sortedRows.length === 0 ? (
        <p className="text-slate-500 text-sm">Aucune vulnérabilité trouvée.</p>
      ) : null}

      {/* Groups */}
      {!loading && !error && groups.length > 0 ? (
        <div className="space-y-2">
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.key);
            return (
              <div key={group.key} className="rounded-lg border border-slate-700 overflow-hidden">
                {/* Group header */}
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  className="flex w-full items-center justify-between px-4 py-2 bg-slate-800 hover:bg-slate-750 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-sm text-slate-100">{group.label}</span>
                    <span className="text-xs text-slate-400">({group.rows.length})</span>
                    <SeverityBar rows={group.rows} />
                  </div>
                  <span className="text-slate-400 text-xs">{isCollapsed ? '▶' : '▼'}</span>
                </button>

                {/* Rows */}
                {!isCollapsed ? (
                  <div className="divide-y divide-slate-800">
                    {group.rows.map((row) => (
                      <div
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect?.(row.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') onSelect?.(row.id);
                        }}
                        className="flex items-center gap-3 px-4 py-2 text-sm cursor-pointer hover:bg-slate-800 transition-colors"
                      >
                        {/* Severity badge */}
                        <span
                          className={`inline-block shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${
                            SEVERITY_STYLE[row.severity as Severity] ?? SEVERITY_STYLE.INFO
                          }`}
                        >
                          {row.severity}
                        </span>

                        {/* Title */}
                        <span className="flex-1 truncate text-slate-100">{row.title}</span>

                        {/* Asset */}
                        <span className="shrink-0 text-xs text-slate-400 max-w-[120px] truncate">
                          {row.assetValue ?? row.assetId}
                        </span>

                        {/* Tool badges */}
                        <span className="flex shrink-0 gap-1">
                          {row.sources.map((src) => (
                            <span
                              key={src}
                              className="rounded bg-slate-700 px-1.5 py-0.5 text-xs text-slate-300"
                            >
                              {src}
                            </span>
                          ))}
                        </span>

                        {/* CVE */}
                        <span className="shrink-0 font-mono text-xs text-slate-400">
                          {row.cveId ?? '—'}
                        </span>

                        {/* Risk score */}
                        <span className="shrink-0 text-xs font-semibold text-slate-200 w-8 text-right">
                          {row.riskScore.toFixed(1)}
                        </span>

                        {/* Status */}
                        <span className="shrink-0 text-xs text-slate-400">{row.status}</span>
                      </div>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
