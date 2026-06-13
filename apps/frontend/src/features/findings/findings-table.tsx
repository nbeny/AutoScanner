import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { FINDINGS_QUERY } from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;
type Severity = (typeof SEVERITIES)[number];

interface FindingRow {
  id: string;
  title: string;
  severity: Severity;
  location?: string | null;
  cveId?: string | null;
  templateId?: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
}

const SEVERITY_STYLE: Record<Severity, string> = {
  CRITICAL: 'bg-red-700 text-red-50',
  HIGH: 'bg-orange-600 text-orange-50',
  MEDIUM: 'bg-yellow-600 text-yellow-50',
  LOW: 'bg-blue-600 text-blue-50',
  INFO: 'bg-slate-600 text-slate-50',
};

export function FindingsTable({ engagementId }: { engagementId: string }) {
  // Track which severities are currently checked. When the full set is
  // selected (the default), we pass `severities: null` to mean "no filter".
  // When the user unchecks at least one box, we pass the explicit array.
  const [checked, setChecked] = useState<Set<Severity>>(() => new Set(SEVERITIES));

  const severities = useMemo<Severity[] | null>(() => {
    if (checked.size === SEVERITIES.length) return null;
    return SEVERITIES.filter((s) => checked.has(s));
  }, [checked]);

  const { data, loading, error, refetch } = useQuery<{ findings: FindingRow[] }>(FINDINGS_QUERY, {
    variables: { engagementId, severities },
  });

  function toggle(s: Severity) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next;
    });
  }

  const findings = data?.findings ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <h3 className="text-lg font-semibold">Findings ({findings.length})</h3>
        <div className="flex items-center gap-3 flex-wrap" aria-label="severity-filter">
          {SEVERITIES.map((s) => (
            <label key={s} className="flex items-center gap-1 text-xs text-slate-300">
              <input
                type="checkbox"
                checked={checked.has(s)}
                onChange={() => toggle(s)}
                aria-label={s}
              />
              {s}
            </label>
          ))}
          <button
            onClick={() => refetch()}
            className="text-xs text-indigo-400 hover:underline"
            type="button"
          >
            Refresh
          </button>
        </div>
      </div>

      {loading ? <p className="text-slate-400 text-sm">Loading findings…</p> : null}
      {error ? (
        <p className="text-red-400" role="alert">
          {error.message}
        </p>
      ) : null}

      {!loading && !error && findings.length === 0 ? (
        <p className="text-slate-500 text-sm">No findings yet.</p>
      ) : null}

      {findings.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2">Severity</th>
              <th>Title</th>
              <th>Location</th>
              <th>CVE</th>
              <th>First seen</th>
            </tr>
          </thead>
          <tbody>
            {findings.map((f) => (
              <tr key={f.id} className="border-t border-slate-800 align-top">
                <td className="py-2">
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                      SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE.INFO
                    }`}
                  >
                    {f.severity}
                  </span>
                </td>
                <td className="py-2">{f.title}</td>
                <td className="py-2 font-mono text-xs">{f.location ?? '—'}</td>
                <td className="py-2 font-mono text-xs">{f.cveId ?? '—'}</td>
                <td className="py-2 text-xs text-slate-400">{formatDate(f.firstSeenAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
