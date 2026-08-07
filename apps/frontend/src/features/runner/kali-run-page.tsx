// apps/frontend/src/features/runner/kali-run-page.tsx
import { useEffect } from 'react';
import { useQuery, useSubscription } from '@apollo/client';
import { Link, useParams } from 'react-router-dom';
import { KALI_TOOL_RUN_QUERY, KALI_TOOL_RUN_EVENTS_SUBSCRIPTION } from '../../lib/graphql/queries';
import { ToolResultView, type ParsedToolOutput } from './tool-result-view';

interface KaliToolRun {
  id: string;
  binary: string;
  args: string[];
  target: string | null;
  status: string;
  outputFormat: string | null;
  exitCode: number | null;
  parsedJson: ParsedToolOutput | null;
  errorMessage: string | null;
  createdAt: string | null;
}

const TERMINAL = new Set(['COMPLETED', 'FAILED']);
const STEPS = ['PENDING', 'RUNNING', 'PARSING', 'COMPLETED'];

function statusBadgeClass(status: string): string {
  if (status === 'COMPLETED') return 'bg-emerald-900/40 text-emerald-300 border border-emerald-700';
  if (status === 'FAILED') return 'bg-red-900/40 text-red-300 border border-red-700';
  return 'bg-indigo-900/40 text-indigo-300 border border-indigo-700';
}

export function KaliRunPage() {
  const { runId } = useParams<{ runId: string }>();
  const { data, refetch, startPolling, stopPolling } = useQuery<{
    kaliToolRun: KaliToolRun | null;
  }>(KALI_TOOL_RUN_QUERY, {
    skip: !runId,
    variables: runId ? { id: runId } : undefined,
    fetchPolicy: 'network-only',
  });

  useSubscription(KALI_TOOL_RUN_EVENTS_SUBSCRIPTION, {
    skip: !runId,
    variables: runId ? { runId } : undefined,
    onData: () => {
      void refetch();
    },
  });

  const run = data?.kaliToolRun ?? null;
  const notFound = Boolean(data) && data?.kaliToolRun == null;

  useEffect(() => {
    if (!runId) return;
    startPolling(2500);
    return () => stopPolling();
  }, [runId, startPolling, stopPolling]);

  useEffect(() => {
    // Stop polling once the run is terminal OR the query resolved to "not found"
    // (a genuinely missing id returns null forever — don't poll it every 2.5s).
    if ((run && TERMINAL.has(run.status)) || notFound) stopPolling();
  }, [run, notFound, stopPolling]);

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-5">
      <nav className="text-xs text-slate-400">
        <Link to="/runner" className="hover:underline">
          ← nouveau run
        </Link>
      </nav>

      {run ? (
        <>
          <header className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-1 min-w-0">
              <h1 className="font-mono text-lg text-slate-100 break-all">
                <span className="text-neon-cyan">{run.binary}</span> {run.args.join(' ')}
              </h1>
              <p className="text-xs text-slate-500">
                run <code>{run.id}</code>
              </p>
            </div>
            <div className="flex items-center gap-3 text-sm">
              <span className={`rounded px-2 py-1 text-xs ${statusBadgeClass(run.status)}`}>
                {run.status}
              </span>
              {run.exitCode != null ? (
                <span className="text-slate-400">
                  exit <strong className="text-slate-200">{run.exitCode}</strong>
                </span>
              ) : null}
              {run.outputFormat ? (
                <span className="text-xs text-slate-500">{run.outputFormat}</span>
              ) : null}
            </div>
          </header>

          {/* step indicator */}
          <ol className="flex items-center gap-2 text-xs">
            {STEPS.map((s) => {
              const reached =
                STEPS.indexOf(s) <= STEPS.indexOf(run.status) || run.status === 'FAILED';
              return (
                <li
                  key={s}
                  className={`rounded px-2 py-0.5 ${
                    reached ? 'bg-space-800 text-slate-200' : 'text-slate-600'
                  }`}
                >
                  {s.toLowerCase()}
                </li>
              );
            })}
          </ol>

          {run.errorMessage ? (
            <p role="alert" className="text-sm text-rose-400">
              {run.errorMessage}
            </p>
          ) : null}

          <section aria-label="result" className="space-y-2">
            <h2 className="text-sm font-medium text-slate-300">Résultat</h2>
            <ToolResultView parsed={run.parsedJson} />
          </section>
        </>
      ) : notFound ? (
        <p className="text-slate-400">Run introuvable.</p>
      ) : (
        <p className="text-slate-400">Chargement…</p>
      )}
    </div>
  );
}
