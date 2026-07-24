import { useMemo, useState, type FormEvent } from 'react';
import { useMutation } from '@apollo/client';
import { Navigate, useNavigate } from 'react-router-dom';
import { parseTarget } from '@autoscanner/target-parser';
import { RUN_AI_SCAN } from '../../lib/graphql/queries';
import { useAuth } from '../../lib/auth-context';
import { GuardrailsPanel } from './guardrails-panel';
import { DEFAULT_GUARDRAILS, type Guardrails } from './types';

interface RunAiScanResult {
  runAiScan: {
    id: string;
    status: string;
    target: string;
    strategy: string;
  };
}

const STRATEGY_LABEL: Record<string, string> = {
  SINGLE_HOST: 'single host',
  RANGE_PER_HOST: 'range → per-host',
  RANGE_AGGREGATE: 'range → aggregate',
};

export function HuntSearchPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [target, setTarget] = useState('');
  const [guardrails, setGuardrails] = useState<Guardrails>(DEFAULT_GUARDRAILS);
  const [showGuardrails, setShowGuardrails] = useState(false);

  const [runAiScan, { loading, error }] = useMutation<RunAiScanResult>(RUN_AI_SCAN);

  const trimmed = target.trim();
  const parsed = useMemo(() => (trimmed ? parseTarget(trimmed) : null), [trimmed]);
  const isInvalid = parsed !== null && parsed.kind === 'invalid';
  const canSubmit = parsed !== null && !isInvalid && !loading;

  if (!session) return <Navigate to="/login" replace />;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    const res = await runAiScan({
      variables: { input: { target: trimmed, guardrails } },
    });
    const created = res.data?.runAiScan;
    if (created) navigate(`/hunt/${created.id}`);
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 bg-slate-950">
      <div className="w-full max-w-xl flex flex-col items-center space-y-6">
        <h1 className="text-5xl font-semibold tracking-tight text-slate-100">
          Auto<span className="text-indigo-400">Hunt</span>
        </h1>

        <form onSubmit={onSubmit} className="w-full space-y-3" aria-label="hunt-search">
          <div className="flex items-center gap-2">
            <input
              aria-label="target"
              className="w-full bg-slate-800 rounded-full px-5 py-3 text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Enter an IP, range, or CIDR (IPv4 / IPv6)…"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              autoFocus
            />
            <button
              type="submit"
              disabled={!canSubmit}
              className="shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-full px-5 py-3 font-medium"
            >
              {loading ? 'Starting…' : 'Hunt'}
            </button>
          </div>

          {isInvalid ? (
            <p className="text-sm text-amber-400" role="status">
              Not a valid IP / range / CIDR
            </p>
          ) : parsed ? (
            <p className="text-sm text-slate-400">
              Detected: <span className="text-slate-200">{parsed.kind}</span>
              {' · '}
              {STRATEGY_LABEL[parsed.strategy] ?? parsed.strategy}
            </p>
          ) : null}

          {error ? (
            <p className="text-sm text-red-400" role="alert">
              {error.message}
            </p>
          ) : null}

          <details
            className="w-full bg-slate-900 rounded p-3"
            open={showGuardrails}
            onToggle={(e) => setShowGuardrails((e.target as HTMLDetailsElement).open)}
          >
            <summary className="cursor-pointer text-sm text-slate-300 select-none">
              Guardrails
            </summary>
            <div className="mt-3">
              <GuardrailsPanel value={guardrails} onChange={setGuardrails} />
            </div>
          </details>
        </form>
      </div>
    </div>
  );
}
