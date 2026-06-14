import { useState, type FormEvent } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import {
  AGENTS_QUERY,
  CREATE_AGENT_REGISTRATION_MUTATION,
  REVOKE_AGENT_MUTATION,
} from '../../lib/graphql/queries';
import { formatDate } from '../../lib/format-date';

type AgentStatus = 'PENDING' | 'ACTIVE' | 'IDLE' | 'OFFLINE' | 'REVOKED';

interface Agent {
  id: string;
  name: string;
  hostname: string | null;
  status: AgentStatus;
  capabilities: unknown;
  version: string | null;
  lastHeartbeatAt: string | null;
  enrolledAt: string | null;
  createdAt: string;
}

export function AgentsPanel() {
  const { data, loading, error, refetch } = useQuery<{ agents: Agent[] }>(AGENTS_QUERY);

  const [createAgentRegistration, { error: createError }] = useMutation(
    CREATE_AGENT_REGISTRATION_MUTATION,
  );
  const [revokeAgent, { error: revokeError }] = useMutation(REVOKE_AGENT_MUTATION);

  const [name, setName] = useState('');
  const [bootstrapToken, setBootstrapToken] = useState<string | null>(null);
  const [enrolling, setEnrolling] = useState(false);

  const submitDisabled = enrolling || name.trim().length === 0;

  async function onEnrol(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitDisabled) return;
    setEnrolling(true);
    try {
      const result = await createAgentRegistration({
        variables: { input: { name: name.trim() } },
      });
      const token = result.data?.createAgentRegistration?.bootstrapToken ?? null;
      setBootstrapToken(token);
      setName('');
      await refetch();
    } catch {
      // surfaced via createError
    } finally {
      setEnrolling(false);
    }
  }

  async function onRevoke(id: string) {
    try {
      await revokeAgent({ variables: { id } });
      await refetch();
    } catch {
      // surfaced via revokeError
    }
  }

  const anyError = createError ?? revokeError;

  return (
    <div className="space-y-6">
      {loading && <p className="text-slate-400 text-sm">Loading…</p>}
      {error && (
        <p className="text-red-400 text-sm" role="alert">
          {error.message}
        </p>
      )}
      {anyError && (
        <p className="text-red-400 text-sm" role="alert">
          {anyError.message}
        </p>
      )}

      {bootstrapToken && (
        <div className="border border-yellow-600 rounded p-4 space-y-2 bg-yellow-950/20">
          <p className="text-yellow-400 text-sm font-semibold">
            Copy this token now — it will not be shown again.
          </p>
          <pre
            data-testid="bootstrap-token"
            className="bg-slate-900 rounded p-3 text-xs font-mono break-all select-all"
          >
            <code>{bootstrapToken}</code>
          </pre>
          <button
            type="button"
            onClick={() => setBootstrapToken(null)}
            className="text-xs text-slate-400 hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {!loading && !error && (
        <div className="space-y-2">
          {(data?.agents ?? []).length === 0 ? (
            <p className="text-slate-500 text-sm">No agents enrolled.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-slate-400 text-left">
                <tr>
                  <th className="py-2">Name</th>
                  <th>Status</th>
                  <th>Hostname</th>
                  <th>Last heartbeat</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(data?.agents ?? []).map((agent) => (
                  <tr key={agent.id} className="border-t border-slate-800">
                    <td className="py-2">{agent.name}</td>
                    <td>{agent.status}</td>
                    <td>{agent.hostname ?? '—'}</td>
                    <td className="text-xs text-slate-400">
                      {agent.lastHeartbeatAt ? formatDate(agent.lastHeartbeatAt) : '—'}
                    </td>
                    <td className="text-right">
                      {agent.status !== 'REVOKED' && (
                        <button
                          type="button"
                          onClick={() => onRevoke(agent.id)}
                          aria-label={`Revoke agent ${agent.id}`}
                          className="text-xs text-red-400 hover:underline"
                        >
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <form
        onSubmit={onEnrol}
        className="space-y-4 border border-slate-800 rounded p-4"
        aria-label="enrol-agent"
      >
        <h3 className="text-sm font-medium text-slate-300">Enrol a new agent</h3>
        <div className="flex gap-3 items-end">
          <div className="space-y-1 flex-1">
            <label htmlFor="agent-name" className="text-xs text-slate-400">
              Agent name
            </label>
            <input
              id="agent-name"
              aria-label="Agent name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. laptop-02"
              className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            disabled={submitDisabled}
            className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded text-sm"
          >
            {enrolling ? 'Enrolling…' : 'Enrol'}
          </button>
        </div>
      </form>
    </div>
  );
}
