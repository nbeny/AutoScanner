import { useState } from 'react';
import { useQuery } from '@apollo/client';
import { ALL_SCANS_QUERY } from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

// ─── Types ───────────────────────────────────────────────────────────────────

type ScanStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
type JobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'TIMEOUT';

interface ScanJob {
  id: string;
  scannerName: string;
  target: string;
  status: JobStatus;
  durationMs: number | null;
  exitCode: number | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  findingCount: number;
}

interface Scan {
  id: string;
  engagementId: string;
  name: string;
  status: ScanStatus;
  createdAt: string;
  completedAt: string | null;
  jobs: ScanJob[];
}

interface AllScansData {
  allScans: Scan[];
}

// ─── Constants ───────────────────────────────────────────────────────────────

const FILTER_OPTIONS: Array<{ label: string; value: ScanStatus | 'ALL' }> = [
  { label: 'All', value: 'ALL' },
  { label: 'Queued', value: 'QUEUED' },
  { label: 'Running', value: 'RUNNING' },
  { label: 'Completed', value: 'COMPLETED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Cancelled', value: 'CANCELLED' },
];

const TERMINAL_STATUSES: Set<JobStatus> = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'TIMEOUT']);

const STATUS_STYLE: Record<string, string> = {
  RUNNING: 'bg-blue-600 text-blue-50',
  QUEUED: 'bg-slate-600 text-slate-50',
  COMPLETED: 'bg-green-700 text-green-50',
  FAILED: 'bg-red-700 text-red-50',
  CANCELLED: 'bg-amber-600 text-amber-50',
  TIMEOUT: 'bg-orange-600 text-orange-50',
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function totalDurationMs(jobs: ScanJob[]): number | null {
  const vals = jobs.map((j) => j.durationMs).filter((d): d is number => d !== null);
  if (vals.length === 0) return null;
  return vals.reduce((a, b) => a + b, 0);
}

function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}m ${rem}s`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export interface ScansListProps {
  engagementId?: string;
  onSelect?: (scanId: string) => void;
}

export function ScansList({ engagementId, onSelect }: ScansListProps = {}) {
  const [activeFilter, setActiveFilter] = useState<ScanStatus | 'ALL'>('ALL');

  // Build filter: always send an object; add status only when not 'ALL'
  const filter: Record<string, string> = {};
  if (engagementId) filter['engagementId'] = engagementId;
  if (activeFilter !== 'ALL') filter['status'] = activeFilter;

  const { data, loading, error } = useQuery<AllScansData>(ALL_SCANS_QUERY, {
    variables: { filter },
  });

  const scans = data?.allScans ?? [];

  // Status bar counts
  const runningCount = scans.filter((s) => s.status === 'RUNNING').length;
  const queuedCount = scans.filter((s) => s.status === 'QUEUED').length;
  const failedCount = scans.filter((s) => s.status === 'FAILED').length;

  return (
    <div className="space-y-3">
      {/* Filter buttons */}
      <div className="flex items-center gap-2 flex-wrap" aria-label="scan-status-filter">
        {FILTER_OPTIONS.map(({ label, value }) => (
          <button
            key={value}
            type="button"
            onClick={() => setActiveFilter(value as ScanStatus | 'ALL')}
            className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
              activeFilter === value
                ? 'bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Status bar */}
      <div
        aria-label="scans-status-bar"
        className="flex items-center gap-4 text-xs text-slate-400 bg-slate-800/50 rounded px-3 py-2"
      >
        <span>
          <span className="text-blue-400 font-semibold">{runningCount}</span> running
        </span>
        <span>
          <span className="text-slate-300 font-semibold">{queuedCount}</span> queued
        </span>
        <span>
          <span className="text-red-400 font-semibold">{failedCount}</span> failed
        </span>
      </div>

      {/* Loading / error states */}
      {loading ? <p className="text-slate-400 text-sm">Loading scans…</p> : null}
      {error ? (
        <p className="text-red-400" role="alert">
          {error.message}
        </p>
      ) : null}

      {/* Empty state */}
      {!loading && !error && scans.length === 0 ? (
        <p className="text-slate-500 text-sm">No scans found.</p>
      ) : null}

      {/* Table */}
      {scans.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="text-slate-400 text-left">
            <tr>
              <th className="py-2">Target</th>
              <th>Engagement</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Created</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {scans.map((scan) => {
              const firstTarget = scan.jobs[0]?.target ?? '—';
              const completedJobs = scan.jobs.filter((j) => TERMINAL_STATUSES.has(j.status)).length;
              const totalJobs = scan.jobs.length;
              const duration = formatDuration(totalDurationMs(scan.jobs));

              return (
                <tr
                  key={scan.id}
                  role="row"
                  aria-label={scan.id}
                  className="border-t border-slate-800 align-top cursor-pointer hover:bg-slate-800/40 transition-colors"
                  onClick={() => onSelect?.(scan.id)}
                >
                  <td className="py-2 font-mono text-xs">{firstTarget}</td>
                  <td className="py-2 text-xs text-slate-400">{scan.engagementId.slice(0, 8)}</td>
                  <td className="py-2">
                    <span
                      className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${
                        STATUS_STYLE[scan.status] ?? STATUS_STYLE.QUEUED
                      }`}
                    >
                      {scan.status}
                    </span>
                  </td>
                  <td className="py-2 text-xs">
                    {totalJobs > 0 ? `${completedJobs}/${totalJobs}` : '—'}
                  </td>
                  <td className="py-2 text-xs text-slate-400">{formatDate(scan.createdAt)}</td>
                  <td className="py-2 text-xs text-slate-400">{duration}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : null}
    </div>
  );
}
