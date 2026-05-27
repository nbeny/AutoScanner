import { useState } from 'react';
import { LiveLogsPane } from '../scans/live-logs-pane';
import { useAuth } from '../../lib/auth-context';
import { rawOutputUrl } from '../../lib/api-rest';

export interface TemplateStepScanJob {
  id: string;
  scannerName: string;
  target: string;
  status: string;
  rawOutputKey?: string | null;
}

export interface TemplateStepScan {
  id: string;
  status: string;
  createdAt?: string | null;
  completedAt?: string | null;
  jobs?: TemplateStepScanJob[] | null;
}

interface Props {
  scan: TemplateStepScan;
  index: number;
}

function statusColor(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'text-emerald-400';
    case 'RUNNING':
      return 'text-indigo-300';
    case 'FAILED':
    case 'TIMEOUT':
    case 'CANCELLED':
      return 'text-red-400';
    default:
      return 'text-slate-300';
  }
}

export function TemplateStepCard({ scan, index }: Props) {
  const [open, setOpen] = useState(index === 0);
  const { session } = useAuth();
  const job = scan.jobs?.[0] ?? null;
  const scannerName = job?.scannerName ?? 'unknown';
  const rawHref = job?.rawOutputKey && session ? rawOutputUrl(session.apiUrl, job.id) : null;

  return (
    <section
      aria-label={`template-step-card-${index}`}
      className="bg-slate-900 rounded border border-slate-800"
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-800/70"
        aria-expanded={open}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-slate-800 text-xs">
            {index + 1}
          </span>
          <span className="font-semibold">{scannerName}</span>
          <span className="text-xs text-slate-400">
            scan <code>{scan.id}</code>
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-medium ${statusColor(scan.status)}`}>{scan.status}</span>
          <span className="text-slate-500 text-xs">{open ? 'Hide' : 'Show'}</span>
        </div>
      </button>

      {open ? (
        <div className="px-4 pb-4 space-y-3 border-t border-slate-800 pt-3">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-300">
            <dt className="text-slate-500">Target</dt>
            <dd>{job?.target ?? '—'}</dd>
            <dt className="text-slate-500">Job status</dt>
            <dd>{job?.status ?? '—'}</dd>
            {rawHref ? (
              <>
                <dt className="text-slate-500">Raw output</dt>
                <dd>
                  <a className="text-indigo-400 hover:underline" href={rawHref}>
                    download
                  </a>
                </dd>
              </>
            ) : null}
          </dl>
          <LiveLogsPane scanJobId={job?.id ?? null} />
        </div>
      ) : null}
    </section>
  );
}
