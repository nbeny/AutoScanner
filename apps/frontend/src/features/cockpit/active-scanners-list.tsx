import { useState } from 'react';
import { StatusDot } from '../../components/ui/status-dot';
import { Panel } from '../../components/ui/panel';
import { useActiveScanners, type CockpitJob } from './use-active-scanners';

export interface ActiveScannersListProps {
  engagementId?: string;
  selectedJobId: string | null;
  onSelect: (job: CockpitJob) => void;
}

// Same status vocabulary as the history list, mapped to the scan-level statusIn
// filter. An empty array means "no filter" (Tous).
const FILTERS: Array<{ label: string; value: string; statuses: string[] }> = [
  { label: 'Tous', value: 'ALL', statuses: [] },
  { label: 'En cours', value: 'RUNNING', statuses: ['RUNNING'] },
  { label: 'File', value: 'QUEUED', statuses: ['QUEUED'] },
  { label: 'Terminés', value: 'COMPLETED', statuses: ['COMPLETED'] },
  { label: 'Échoués', value: 'FAILED', statuses: ['FAILED', 'TIMEOUT', 'CANCELLED'] },
];

export function ActiveScannersList({
  engagementId,
  selectedJobId,
  onSelect,
}: ActiveScannersListProps) {
  // Default to "Tous" so the panel always shows recent scans instead of the
  // near-permanent "aucun scanner en cours" (a scan is only RUNNING for seconds).
  const [filter, setFilter] = useState('ALL');
  const statuses = FILTERS.find((f) => f.value === filter)?.statuses ?? [];
  const { active, loading } = useActiveScanners(engagementId, statuses);

  return (
    <Panel aria-label="active-scanners" className="flex h-full flex-col gap-2 overflow-auto">
      <h2 className="text-xs uppercase tracking-wide text-slate-500">Scans</h2>

      <div className="flex flex-wrap gap-1" aria-label="scanner-status-filter">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            className={`rounded px-2 py-0.5 text-xs font-medium transition-colors ${
              filter === f.value
                ? 'bg-neon-cyan/20 text-neon-cyan'
                : 'bg-space-900 text-slate-400 hover:bg-space-800'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading && active.length === 0 ? (
        <p className="text-sm text-slate-500">Chargement…</p>
      ) : null}
      {!loading && active.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun scan pour ce filtre.</p>
      ) : null}
      {active.map((job: CockpitJob) => {
        const selected = job.jobId === selectedJobId;
        return (
          <button
            key={job.jobId}
            type="button"
            onClick={() => onSelect(job)}
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
