import { useQuery } from '@apollo/client';
import { TOOL_DETAIL_QUERY } from '../../lib/graphql/queries';
import { scannerCategory } from '../scans/scanner-catalog';
import { formatDate } from '../../lib/format-date';

export interface ToolDetailDrawerProps {
  scannerName: string | null;
  engagementId?: string;
  onClose: () => void;
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(1)} s`;
}

function ToolDetailBody({
  scannerName,
  engagementId,
}: {
  scannerName: string;
  engagementId?: string;
}) {
  const { data, loading, error } = useQuery(TOOL_DETAIL_QUERY, {
    variables: { engagementId: engagementId ?? null, scannerName },
  });

  if (loading) {
    return <p className="text-slate-400 text-sm">Chargement…</p>;
  }

  if (error) {
    return <p className="text-red-400 text-sm">Erreur : {error.message}</p>;
  }

  const detail = data?.toolDetail;
  if (!detail) {
    return <p className="text-slate-400 text-sm">Aucune donnée.</p>;
  }

  return (
    <div className="space-y-6">
      {/* Tool name + category */}
      <div>
        <h2 className="text-xl font-semibold text-slate-100">{detail.scannerName}</h2>
        <p className="text-sm text-slate-400 mt-1">{scannerCategory(detail.scannerName)}</p>
      </div>

      {/* Runs */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
          Historique des exécutions
        </h3>
        {detail.runs.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucune exécution.</p>
        ) : (
          <table className="w-full text-sm text-slate-300 border-collapse">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-slate-700">
                <th className="pb-1 pr-3">Statut</th>
                <th className="pb-1 pr-3">Durée</th>
                <th className="pb-1 pr-3">Exit</th>
                <th className="pb-1 pr-3">Terminé le</th>
                <th className="pb-1 pr-3">Agent</th>
                <th className="pb-1">Erreur</th>
              </tr>
            </thead>
            <tbody>
              {detail.runs.map(
                (run: {
                  scanJobId: string;
                  status: string;
                  durationMs?: number | null;
                  exitCode?: number | null;
                  errorMessage?: string | null;
                  completedAt?: string | null;
                  agentId?: string | null;
                }) => (
                  <tr key={run.scanJobId} className="border-b border-slate-800 align-top">
                    <td className="py-1 pr-3 font-mono">{run.status}</td>
                    <td className="py-1 pr-3">{formatDuration(run.durationMs)}</td>
                    <td className="py-1 pr-3">{run.exitCode ?? '—'}</td>
                    <td className="py-1 pr-3">
                      {run.completedAt ? formatDate(run.completedAt) : '—'}
                    </td>
                    <td className="py-1 pr-3">{run.agentId ?? '—'}</td>
                    <td className="py-1 text-red-400">{run.errorMessage ?? ''}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </section>

      {/* Recurring errors */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
          Erreurs récurrentes
        </h3>
        {detail.recurringErrors.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucune erreur récurrente.</p>
        ) : (
          <ul className="space-y-1">
            {detail.recurringErrors.map((err: { message: string; count: number }, i: number) => (
              <li key={i} className="text-sm flex gap-2">
                <span className="text-red-400 shrink-0">×{err.count}</span>
                <span className="text-slate-300">{err.message}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Agents */}
      <section>
        <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wide mb-2">
          Agents
        </h3>
        {detail.agents.length === 0 ? (
          <p className="text-slate-500 text-sm">Aucun agent.</p>
        ) : (
          <table className="w-full text-sm text-slate-300 border-collapse">
            <thead>
              <tr className="text-left text-slate-500 text-xs border-b border-slate-700">
                <th className="pb-1 pr-3">Agent ID</th>
                <th className="pb-1 pr-3">Exécutions</th>
                <th className="pb-1">Succès</th>
              </tr>
            </thead>
            <tbody>
              {detail.agents.map(
                (agent: { agentId: string; executions: number; successCount: number }) => (
                  <tr key={agent.agentId} className="border-b border-slate-800">
                    <td className="py-1 pr-3 font-mono">{agent.agentId}</td>
                    <td className="py-1 pr-3">{agent.executions}</td>
                    <td className="py-1">{agent.successCount}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

export function ToolDetailDrawer({ scannerName, engagementId, onClose }: ToolDetailDrawerProps) {
  if (!scannerName) return null;

  return (
    <div
      aria-label="tool-detail-drawer"
      className="fixed inset-y-0 right-0 w-[640px] max-w-full bg-slate-900 border-l border-slate-700 shadow-2xl flex flex-col z-50 overflow-hidden"
    >
      {/* Drawer header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 shrink-0">
        <span className="text-slate-200 text-sm font-medium">{scannerName}</span>
        <button
          type="button"
          onClick={onClose}
          aria-label="close-drawer"
          className="text-slate-400 hover:text-slate-100 text-xl leading-none px-2"
        >
          ✕
        </button>
      </div>

      {/* Drawer body */}
      <div className="flex-1 overflow-y-auto p-4">
        <ToolDetailBody scannerName={scannerName} engagementId={engagementId} />
      </div>
    </div>
  );
}
