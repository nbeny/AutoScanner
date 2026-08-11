import { useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  SCAN_QUERY,
  CANCEL_SCAN_MUTATION,
  CANCEL_SCAN_JOB_MUTATION,
  RETRY_SCAN_MUTATION,
  RETRY_SCAN_JOB_MUTATION,
} from '../../lib/graphql/queries';
import { LiveLogsPane } from './live-logs-pane';
import { formatDate } from '../../lib/format-date';

// ─── Types ────────────────────────────────────────────────────────────────────

type ScanStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';

interface ScanJob {
  id: string;
  scannerName: string;
  target: string;
  status: JobStatus;
  rawOutputKey: string | null;
  findingCount: number;
}

interface Scan {
  id: string;
  status: ScanStatus;
  createdAt: string;
  completedAt: string | null;
  jobs: ScanJob[];
}

interface ScanQueryResult {
  scan: Scan;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TERMINAL_JOB_STATUSES: Set<string> = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']);

const SCAN_STATUS_STYLE: Record<string, string> = {
  RUNNING: 'bg-blue-600 text-blue-50',
  QUEUED: 'bg-slate-600 text-slate-50',
  COMPLETED: 'bg-green-700 text-green-50',
  FAILED: 'bg-red-700 text-red-50',
  CANCELLED: 'bg-amber-600 text-amber-50',
};

const JOB_STATUS_STYLE: Record<string, string> = {
  RUNNING: 'bg-blue-600 text-blue-50',
  QUEUED: 'bg-slate-600 text-slate-50',
  COMPLETED: 'bg-green-700 text-green-50',
  FAILED: 'bg-red-700 text-red-50',
  CANCELLED: 'bg-amber-600 text-amber-50',
  TIMEOUT: 'bg-orange-600 text-orange-50',
};

// ─── Component ────────────────────────────────────────────────────────────────

export interface ScanDetailBodyProps {
  scanId: string;
}

export function ScanDetailBody({ scanId }: ScanDetailBodyProps) {
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);

  const { data, loading, error, refetch } = useQuery<ScanQueryResult>(SCAN_QUERY, {
    variables: { id: scanId },
    fetchPolicy: 'network-only',
  });

  const [cancelScan, { loading: cancellingState }] = useMutation(CANCEL_SCAN_MUTATION, {
    onCompleted: () => refetch(),
  });

  const [retryScan, { loading: retryingState }] = useMutation(RETRY_SCAN_MUTATION, {
    onCompleted: () => refetch(),
  });

  const [cancelScanJob] = useMutation(CANCEL_SCAN_JOB_MUTATION, {
    onCompleted: () => refetch(),
  });

  const [retryScanJob] = useMutation(RETRY_SCAN_JOB_MUTATION, {
    onCompleted: () => refetch(),
  });

  if (loading) {
    return (
      <div aria-label="scan-detail">
        <p className="text-slate-400 text-sm">Loading…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div aria-label="scan-detail">
        <p className="text-red-400" role="alert">
          {error.message}
        </p>
      </div>
    );
  }

  if (!data?.scan) {
    return (
      <div aria-label="scan-detail">
        <p className="text-slate-500 text-sm">Scan not found.</p>
      </div>
    );
  }

  const scan = data.scan;
  const firstJob = scan.jobs[0] ?? null;
  const activeJobId = selectedJobId ?? firstJob?.id ?? null;

  return (
    <div aria-label="scan-detail" className="space-y-6">
      {/* ── Scan header ──────────────────────────────────────────────────── */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-semibold">Scan {scan.id}</h2>
        <span
          className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
            SCAN_STATUS_STYLE[scan.status] ?? SCAN_STATUS_STYLE.QUEUED
          }`}
        >
          {scan.status}
        </span>
        <span className="text-xs text-slate-400">{formatDate(scan.createdAt)}</span>
        {scan.completedAt ? (
          <span className="text-xs text-slate-400">→ {formatDate(scan.completedAt)}</span>
        ) : null}
      </div>

      {/* ── Scan-level actions ───────────────────────────────────────────── */}
      <div className="flex gap-2">
        <button
          type="button"
          disabled={cancellingState}
          onClick={() => cancelScan({ variables: { id: scan.id } })}
          className="px-3 py-1 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white disabled:opacity-50"
        >
          Annuler le scan
        </button>
        <button
          type="button"
          disabled={retryingState}
          onClick={() => retryScan({ variables: { id: scan.id } })}
          className="px-3 py-1 text-xs rounded bg-indigo-700 hover:bg-indigo-600 text-white disabled:opacity-50"
        >
          Relancer le scan
        </button>
      </div>

      {/* ── Jobs list ────────────────────────────────────────────────────── */}
      {scan.jobs.length === 0 ? (
        <p className="text-slate-500 text-sm">No jobs for this scan.</p>
      ) : (
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-300">Jobs</h3>
          {scan.jobs.map((job) => {
            const isTerminal = TERMINAL_JOB_STATUSES.has(job.status);
            const isSelected = activeJobId === job.id;
            return (
              <div
                key={job.id}
                className={`rounded bg-slate-800 p-3 space-y-2 cursor-pointer border ${
                  isSelected ? 'border-indigo-500' : 'border-transparent'
                }`}
                onClick={() => setSelectedJobId(job.id)}
              >
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-slate-100">{job.scannerName}</span>
                  <span className="text-xs text-slate-400">{job.target}</span>
                  <span
                    className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                      JOB_STATUS_STYLE[job.status] ?? JOB_STATUS_STYLE.QUEUED
                    }`}
                  >
                    {job.status}
                  </span>
                </div>

                {/* Per-job actions */}
                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {!isTerminal ? (
                    <button
                      type="button"
                      onClick={() => cancelScanJob({ variables: { id: job.id } })}
                      className="px-2 py-0.5 text-xs rounded bg-amber-700 hover:bg-amber-600 text-white"
                    >
                      Annuler
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => retryScanJob({ variables: { id: job.id } })}
                    className="px-2 py-0.5 text-xs rounded bg-indigo-700 hover:bg-indigo-600 text-white"
                  >
                    Relancer
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Live logs ────────────────────────────────────────────────────── */}
      <div>
        <h3 className="text-sm font-semibold text-slate-300 mb-2">Live logs</h3>
        <LiveLogsPane scanJobId={activeJobId} />
      </div>
    </div>
  );
}
