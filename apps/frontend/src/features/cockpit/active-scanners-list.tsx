import { StatusDot } from '../../components/ui/status-dot';
import { Panel } from '../../components/ui/panel';
import { useActiveScanners, type CockpitJob } from './use-active-scanners';

export interface ActiveScannersListProps {
  engagementId?: string;
  selectedJobId: string | null;
  onSelect: (scanId: string, jobId: string) => void;
}

export function ActiveScannersList({
  engagementId,
  selectedJobId,
  onSelect,
}: ActiveScannersListProps) {
  const { active, loading } = useActiveScanners(engagementId);

  return (
    <Panel aria-label="active-scanners" className="flex h-full flex-col gap-2 overflow-auto">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">Scanners actifs</h2>
      {loading && active.length === 0 ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : null}
      {!loading && active.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun scanner en cours.</p>
      ) : null}
      {active.map((job: CockpitJob) => {
        const selected = job.jobId === selectedJobId;
        return (
          <button
            key={job.jobId}
            type="button"
            onClick={() => onSelect(job.scanId, job.jobId)}
            className={`flex items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
              selected
                ? 'border-neon-cyan/50 bg-neon-cyan/10'
                : 'border-space-800 hover:bg-space-800/60'
            }`}
          >
            <span className="flex items-center gap-2">
              <StatusDot status={job.status} />
              <span className="text-sm text-slate-100">{job.scannerName}</span>
            </span>
            <span className="font-mono text-xs text-slate-400">{job.target}</span>
          </button>
        );
      })}
    </Panel>
  );
}
