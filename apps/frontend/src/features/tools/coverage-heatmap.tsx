import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { COVERAGE_MATRIX_QUERY, ASSET_COVERAGE_QUERY } from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CoverageCell {
  assetType: string;
  scannerName: string;
  observationCount: number;
  assetCount: number;
  lastObservedAt?: string | null;
}

interface AssetCoverageRow {
  assetId: string;
  assetValue: string;
  assetType: string;
  scannerName: string;
  observationCount: number;
  lastObservedAt?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns a Tailwind background class based on observation count. */
function intensityClass(count: number): string {
  if (count >= 10) return 'bg-indigo-600 text-white';
  if (count >= 3) return 'bg-indigo-400/80 text-white';
  return 'bg-indigo-200/60 text-indigo-900';
}

// ---------------------------------------------------------------------------
// DrillDown sub-component
// ---------------------------------------------------------------------------

interface DrillDownProps {
  engagementId?: string | null;
  assetType: string;
  onClose: () => void;
}

function DrillDown({ engagementId, assetType, onClose }: DrillDownProps) {
  const { data, loading, error } = useQuery<{ assetCoverage: AssetCoverageRow[] }>(
    ASSET_COVERAGE_QUERY,
    {
      variables: { engagementId: engagementId ?? null, assetType },
    },
  );

  const rows = data?.assetCoverage ?? [];

  return (
    <div className="mt-4 space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-slate-200">
          Détail : <span className="text-indigo-400">{assetType}</span>
        </h3>
        <button
          type="button"
          onClick={onClose}
          className="text-xs text-slate-400 hover:text-slate-100 underline"
        >
          Close drill-down
        </button>
      </div>

      {loading && <p className="text-slate-400 text-sm">Chargement…</p>}
      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error.message}
        </p>
      )}

      {!loading && !error && (
        <div className="overflow-x-auto">
          <table
            aria-label="coverage-drilldown"
            className="w-full text-xs border-collapse border border-slate-700"
          >
            <thead>
              <tr className="bg-slate-800 text-slate-300">
                <th className="border border-slate-700 px-3 py-2 text-left">Asset</th>
                <th className="border border-slate-700 px-3 py-2 text-left">Scanner</th>
                <th className="border border-slate-700 px-3 py-2 text-right">Observations</th>
                <th className="border border-slate-700 px-3 py-2 text-left">Dernière obs.</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td
                    colSpan={4}
                    className="border border-slate-700 px-3 py-4 text-center text-slate-500"
                  >
                    Aucune donnée.
                  </td>
                </tr>
              )}
              {rows.map((row) => (
                <tr key={`${row.assetId}-${row.scannerName}`} className="hover:bg-slate-800/50">
                  <td className="border border-slate-700 px-3 py-1.5 text-slate-100">
                    {row.assetValue}
                  </td>
                  <td className="border border-slate-700 px-3 py-1.5 text-slate-300">
                    {row.scannerName}
                  </td>
                  <td className="border border-slate-700 px-3 py-1.5 text-right text-slate-200">
                    {row.observationCount}
                  </td>
                  <td className="border border-slate-700 px-3 py-1.5 text-slate-400">
                    {row.lastObservedAt ? formatDate(row.lastObservedAt) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CoverageHeatmap
// ---------------------------------------------------------------------------

export interface CoverageHeatmapProps {
  engagementId?: string;
}

export function CoverageHeatmap({ engagementId }: CoverageHeatmapProps = {}) {
  const [selected, setSelected] = useState<{ assetType: string } | null>(null);

  const { data, loading, error } = useQuery<{ coverageMatrix: CoverageCell[] }>(
    COVERAGE_MATRIX_QUERY,
    { variables: { engagementId: engagementId ?? null } },
  );

  const cells = data?.coverageMatrix ?? [];

  // Derive unique asset types (rows) and scanner names (columns)
  const assetTypes = [...new Set(cells.map((c) => c.assetType))];
  const scannerNames = [...new Set(cells.map((c) => c.scannerName))];

  // Index cells by assetType→scannerName for O(1) lookup
  const cellIndex = new Map<string, CoverageCell>();
  for (const cell of cells) {
    cellIndex.set(`${cell.assetType}::${cell.scannerName}`, cell);
  }

  const hasData = assetTypes.length > 0 && scannerNames.length > 0;

  return (
    <div className="space-y-4">
      {loading && <p className="text-slate-400 text-sm">Chargement…</p>}
      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error.message}
        </p>
      )}
      {!loading && !error && !hasData && (
        <p className="text-slate-500 text-sm">Aucune donnée de couverture.</p>
      )}

      {hasData && (
        <div className="overflow-x-auto" aria-label="coverage-heatmap">
          <table className="border-collapse text-xs">
            <thead>
              <tr>
                {/* top-left empty corner */}
                <th className="border border-slate-700 bg-slate-900 px-3 py-2" />
                {scannerNames.map((scanner) => (
                  <th
                    key={scanner}
                    className="border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 font-semibold whitespace-nowrap"
                  >
                    {scanner}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {assetTypes.map((assetType) => (
                <tr key={assetType}>
                  <th className="border border-slate-700 bg-slate-800 px-3 py-2 text-slate-300 font-medium text-left whitespace-nowrap">
                    {assetType}
                  </th>
                  {scannerNames.map((scanner) => {
                    const cell = cellIndex.get(`${assetType}::${scanner}`);
                    const hasObs = cell && cell.observationCount > 0;

                    if (!hasObs) {
                      return (
                        <td
                          key={scanner}
                          className="border border-slate-700 bg-slate-900/50 px-3 py-2 text-center text-slate-700"
                        >
                          —
                        </td>
                      );
                    }

                    const titleText = `observations: ${cell.observationCount}, assets: ${cell.assetCount}, last: ${cell.lastObservedAt ? formatDate(cell.lastObservedAt) : '—'}`;

                    return (
                      <td
                        key={scanner}
                        title={titleText}
                        className={`border border-slate-700 px-3 py-2 text-center font-semibold cursor-pointer hover:opacity-80 transition-opacity ${intensityClass(cell.observationCount)}`}
                        onClick={() => setSelected({ assetType })}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') setSelected({ assetType });
                        }}
                        aria-label={`${assetType} × ${scanner}: ${cell.observationCount} observations`}
                      >
                        {cell.observationCount}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && (
        <DrillDown
          engagementId={engagementId}
          assetType={selected.assetType}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
