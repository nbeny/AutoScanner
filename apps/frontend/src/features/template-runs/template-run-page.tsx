import { useEffect, useMemo } from 'react';
import { useQuery } from '@apollo/client';
import { Link, useParams } from 'react-router-dom';
import { TEMPLATE_RUN_QUERY } from '../../lib/graphql/queries';
import { TemplateStepCard, type TemplateStepScan } from './template-step-card';

interface TemplateRunQueryResult {
  templateRun: {
    id: string;
    templateName: string;
    target: string;
    status: string;
    currentStepIndex: number;
    startedAt?: string | null;
    completedAt?: string | null;
    errorMessage?: string | null;
    scans: TemplateStepScan[];
  } | null;
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED']);

function formatDuration(startedAt?: string | null, completedAt?: string | null): string | null {
  if (!startedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = completedAt ? new Date(completedAt).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const seconds = Math.round((end - start) / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rem = seconds % 60;
  return `${minutes}m ${rem}s`;
}

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-900/40 text-emerald-300 border border-emerald-700';
    case 'RUNNING':
      return 'bg-indigo-900/40 text-indigo-300 border border-indigo-700';
    case 'FAILED':
    case 'CANCELLED':
      return 'bg-red-900/40 text-red-300 border border-red-700';
    default:
      return 'bg-slate-800 text-slate-300 border border-slate-700';
  }
}

export function TemplateRunPage() {
  const { engagementId, templateRunId } = useParams<{
    engagementId: string;
    templateRunId: string;
  }>();

  const { data, loading, error, startPolling, stopPolling } = useQuery<TemplateRunQueryResult>(
    TEMPLATE_RUN_QUERY,
    {
      skip: !templateRunId,
      variables: templateRunId ? { id: templateRunId } : undefined,
      fetchPolicy: 'network-only',
    },
  );

  useEffect(() => {
    if (!templateRunId) return;
    startPolling(3000);
    return () => stopPolling();
  }, [templateRunId, startPolling, stopPolling]);

  useEffect(() => {
    if (data?.templateRun && TERMINAL.has(data.templateRun.status)) {
      stopPolling();
    }
  }, [data, stopPolling]);

  const run = data?.templateRun ?? null;
  const duration = useMemo(
    () => (run ? formatDuration(run.startedAt, run.completedAt) : null),
    [run],
  );

  if (!engagementId || !templateRunId) {
    return <p className="p-8">Missing engagement or template run id.</p>;
  }

  return (
    <div className="p-8 max-w-5xl mx-auto space-y-6">
      <nav className="text-xs text-slate-400">
        <Link to={`/engagements/${engagementId}/scans`} className="hover:underline">
          ← back to engagement
        </Link>
      </nav>

      {loading && !run ? <p className="text-slate-400">Loading…</p> : null}
      {error ? (
        <p className="text-red-400" role="alert">
          {error.message}
        </p>
      ) : null}

      {run ? (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1">
              <h1 className="text-2xl font-semibold">{run.templateName}</h1>
              <p className="text-sm text-slate-400">
                target: <code className="text-slate-200">{run.target}</code>
              </p>
              <p className="text-xs text-slate-500">
                run <code>{run.id}</code>
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className={`px-2 py-1 rounded text-xs ${statusBadgeClass(run.status)}`}>
                {run.status}
              </span>
              {duration ? (
                <span className="text-slate-400">
                  duration <strong className="text-slate-200">{duration}</strong>
                </span>
              ) : null}
              <span className="text-slate-500 text-xs">
                step {run.currentStepIndex + 1}/{run.scans?.length || '?'}
              </span>
            </div>
          </header>

          {run.errorMessage ? (
            <p className="text-sm text-red-400" role="alert">
              {run.errorMessage}
            </p>
          ) : null}

          <section className="space-y-3" aria-label="template-run-steps">
            {run.scans && run.scans.length > 0 ? (
              run.scans.map((scan, idx) => (
                <TemplateStepCard key={scan.id} scan={scan} index={idx} />
              ))
            ) : (
              <p className="text-slate-500 text-sm">No steps yet.</p>
            )}
          </section>
        </>
      ) : null}

      {!loading && !run && !error ? (
        <p className="text-slate-400">Template run not found.</p>
      ) : null}
    </div>
  );
}
