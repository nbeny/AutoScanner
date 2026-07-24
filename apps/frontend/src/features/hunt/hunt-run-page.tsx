import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useSubscription } from '@apollo/client';
import { Link, Navigate, useParams } from 'react-router-dom';
import { AI_RUN_EVENTS_SUBSCRIPTION, AI_RUN_QUERY, CANCEL_AI_RUN } from '../../lib/graphql/queries';
import { useAuth } from '../../lib/auth-context';
import type { AiRun } from './types';
import { ScanGraph } from './scan-graph';
import { DecisionTimeline } from './decision-timeline';
import { AuditPanel } from './audit-panel';

interface AiRunQueryResult {
  aiRun: AiRun | null;
}

const TERMINAL = new Set(['COMPLETED', 'FAILED', 'CANCELLED', 'STOPPED_CAP']);

function statusBadgeClass(status: string): string {
  switch (status) {
    case 'COMPLETED':
      return 'bg-emerald-900/40 text-emerald-300 border border-emerald-700';
    case 'RUNNING':
    case 'QUEUED':
      return 'bg-indigo-900/40 text-indigo-300 border border-indigo-700';
    case 'FAILED':
    case 'CANCELLED':
    case 'STOPPED_CAP':
      return 'bg-red-900/40 text-red-300 border border-red-700';
    default:
      return 'bg-slate-800 text-slate-300 border border-slate-700';
  }
}

export function HuntRunPage() {
  const { session } = useAuth();
  const { aiRunId } = useParams<{ aiRunId: string }>();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, loading, error, startPolling, stopPolling, refetch } = useQuery<AiRunQueryResult>(
    AI_RUN_QUERY,
    {
      skip: !aiRunId,
      variables: aiRunId ? { id: aiRunId } : undefined,
      fetchPolicy: 'network-only',
    },
  );

  useSubscription(AI_RUN_EVENTS_SUBSCRIPTION, {
    skip: !aiRunId,
    variables: aiRunId ? { id: aiRunId } : undefined,
    onData: () => {
      void refetch();
    },
  });

  const [cancelAiRun, { loading: cancelling }] = useMutation(CANCEL_AI_RUN);

  useEffect(() => {
    if (!aiRunId) return;
    startPolling(2500);
    return () => stopPolling();
  }, [aiRunId, startPolling, stopPolling]);

  const run = data?.aiRun ?? null;

  useEffect(() => {
    if (run && TERMINAL.has(run.status)) {
      stopPolling();
    }
  }, [run, stopPolling]);

  const selectedNode = useMemo(
    () => run?.nodes.find((n) => n.id === selectedId) ?? null,
    [run, selectedId],
  );

  if (!session) return <Navigate to="/login" replace />;

  const isTerminal = run ? TERMINAL.has(run.status) : false;

  async function onCancel() {
    if (!aiRunId) return;
    await cancelAiRun({ variables: { id: aiRunId } });
    void refetch();
  }

  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <nav className="text-xs text-slate-400">
        <Link to="/hunt" className="hover:underline">
          ← new hunt
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
              <h1 className="text-2xl font-semibold">
                Auto<span className="text-indigo-400">Hunt</span>
              </h1>
              <p className="text-sm text-slate-400">
                target: <code className="text-slate-200">{run.target}</code>
              </p>
              <p className="text-xs text-slate-500">
                run <code>{run.id}</code>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className={`px-2 py-1 rounded text-xs ${statusBadgeClass(run.status)}`}>
                {run.status}
              </span>
              <span className="text-slate-400">
                scans <strong className="text-slate-200">{run.scanCount}</strong>
              </span>
              <span className="text-slate-400">
                depth <strong className="text-slate-200">{run.currentDepth}</strong>
              </span>
              <span className="text-slate-500 text-xs">{run.strategy}</span>
              {run.degraded ? (
                <span className="px-2 py-0.5 rounded text-xs bg-amber-900/40 text-amber-300 border border-amber-700">
                  degraded
                </span>
              ) : null}
              {!isTerminal ? (
                <button
                  type="button"
                  onClick={onCancel}
                  disabled={cancelling}
                  className="bg-red-700 hover:bg-red-600 disabled:opacity-50 rounded px-3 py-1 text-xs font-medium"
                >
                  {cancelling ? 'Cancelling…' : 'Cancel'}
                </button>
              ) : null}
            </div>
          </header>

          {run.errorMessage ? (
            <p className="text-sm text-red-400" role="alert">
              {run.errorMessage}
            </p>
          ) : null}

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <section className="lg:col-span-2 space-y-3" aria-label="scan-path">
              <h2 className="text-sm font-medium text-slate-300">Scan path</h2>
              <ScanGraph nodes={run.nodes} selectedId={selectedId} onSelect={setSelectedId} />
            </section>

            <aside className="space-y-3" aria-label="node-details">
              <h2 className="text-sm font-medium text-slate-300">Selected scanner</h2>
              {selectedNode ? (
                <dl className="bg-slate-900 rounded p-4 space-y-2 text-sm">
                  <div>
                    <dt className="text-xs text-slate-500">scanner</dt>
                    <dd className="text-slate-200">{selectedNode.scannerName}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">target</dt>
                    <dd className="text-slate-200 break-all">
                      <code>{selectedNode.target}</code>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">status</dt>
                    <dd>
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${statusBadgeClass(
                          selectedNode.status,
                        )}`}
                      >
                        {selectedNode.status}
                      </span>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-slate-500">rationale</dt>
                    <dd className="text-slate-300">
                      {selectedNode.rationale ?? <span className="text-slate-500">—</span>}
                    </dd>
                  </div>
                </dl>
              ) : (
                <p className="text-slate-500 text-sm">Select a scanner in the graph.</p>
              )}
            </aside>
          </div>

          <section className="space-y-3" aria-label="decisions">
            <h2 className="text-sm font-medium text-slate-300">AI decisions</h2>
            <DecisionTimeline decisions={run.decisions} />
          </section>

          <section className="space-y-3" aria-label="audit">
            <h2 className="text-sm font-medium text-slate-300">Audit</h2>
            <AuditPanel auditText={run.auditText} status={run.status} />
          </section>
        </>
      ) : null}

      {!loading && !run && !error ? <p className="text-slate-400">Hunt run not found.</p> : null}
    </div>
  );
}
