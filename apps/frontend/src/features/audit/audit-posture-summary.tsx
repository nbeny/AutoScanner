import { useQuery } from '@apollo/client';
import { Panel } from '../../components/ui/panel';
import { ALL_CORRELATED_FINDINGS_QUERY, COVERAGE_SUMMARY_QUERY } from '../../lib/graphql/queries';

interface Finding {
  id: string;
  severity: string;
}

interface Coverage {
  totalAssets: number;
  scannedAssets: number;
  percent: number;
}

const SEVERITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW', 'INFO'] as const;

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'text-rose-400',
  HIGH: 'text-orange-400',
  MEDIUM: 'text-amber-400',
  LOW: 'text-sky-400',
  INFO: 'text-slate-400',
};

export function AuditPostureSummary({ engagementId }: { engagementId?: string }) {
  const { data: findingsData } = useQuery<{ allCorrelatedFindings: Finding[] }>(
    ALL_CORRELATED_FINDINGS_QUERY,
    { variables: { filter: engagementId ? { engagementId } : undefined } },
  );
  const { data: coverageData } = useQuery<{ coverageSummary: Coverage }>(COVERAGE_SUMMARY_QUERY, {
    variables: { engagementId },
  });

  const findings = findingsData?.allCorrelatedFindings ?? [];
  const counts: Record<string, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, INFO: 0 };
  for (const f of findings) {
    if (counts[f.severity] !== undefined) counts[f.severity] += 1;
  }
  const coverage = coverageData?.coverageSummary;

  return (
    <Panel aria-label="posture-summary" className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">Posture</h2>
        <span className="text-xs text-slate-400">
          {findings.length} finding{findings.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {SEVERITIES.map((s) => (
          <div
            key={s}
            aria-label={`sev-${s}`}
            className="rounded-lg border border-space-800 bg-space-900/50 p-2 text-center"
          >
            <div className={`font-mono text-lg font-semibold ${SEV_COLOR[s]}`}>{counts[s]}</div>
            <div className="text-[10px] uppercase text-slate-500">{s}</div>
          </div>
        ))}
      </div>
      <div aria-label="coverage" className="text-xs text-slate-400">
        Couverture :{' '}
        <span className="font-mono text-slate-200">{coverage ? `${coverage.percent}%` : '—'}</span>
        {coverage ? (
          <span className="text-slate-500">
            {' '}
            ({coverage.scannedAssets}/{coverage.totalAssets} assets)
          </span>
        ) : null}
      </div>
    </Panel>
  );
}
