import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from '@apollo/client';
import { Navigate, useNavigate } from 'react-router-dom';
import { CHAINS, RUN_CHAIN } from '../../lib/graphql/queries';
import { useAuth } from '../../lib/auth-context';
import { GuardrailsPanel } from '../hunt/guardrails-panel';
import { DEFAULT_GUARDRAILS, type Guardrails } from '../hunt/types';

interface ChainCapability {
  name: string;
  displayName: string;
  description: string;
  whenToUse: string;
  produces: string[];
  scopeAcknowledgement?: string | null;
}

export function ChainsCatalogPage() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const { data } = useQuery<{ chains: ChainCapability[] }>(CHAINS);
  const [selected, setSelected] = useState<string | null>(null);
  const [target, setTarget] = useState('');
  const [guardrails, setGuardrails] = useState<Guardrails>(DEFAULT_GUARDRAILS);
  const [runChain, { loading, error }] = useMutation<{ runChain: { id: string } }>(RUN_CHAIN);

  if (!session) return <Navigate to="/login" replace />;

  const chains = data?.chains ?? [];
  const chosen = chains.find((c) => c.name === selected) ?? null;
  const canSubmit = !!selected && target.trim().length > 0 && !loading;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!canSubmit) return;
    const res = await runChain({
      variables: { input: { chainName: selected, target: target.trim(), guardrails } },
    });
    const id = res.data?.runChain.id;
    if (id) navigate(`/hunt/${id}`); // vue de run partagée avec AutoHunt
  }

  return (
    <div className="min-h-screen px-4 py-10 bg-slate-950 text-slate-100">
      <div className="max-w-3xl mx-auto space-y-6">
        <h1 className="text-3xl font-semibold">Chaînes de scan</h1>

        <ul className="grid gap-3 sm:grid-cols-2">
          {chains.map((c) => (
            <li key={c.name}>
              <button
                type="button"
                onClick={() => setSelected(c.name)}
                className={`w-full text-left rounded-lg p-4 border ${selected === c.name ? 'border-indigo-500 bg-slate-800' : 'border-slate-700 bg-slate-900'}`}
                aria-pressed={selected === c.name}
              >
                <div className="font-medium">{c.displayName}</div>
                <div className="text-sm text-slate-400">{c.description}</div>
                <div className="text-xs text-slate-500 mt-1">{c.whenToUse}</div>
                <div className="text-xs text-indigo-300 mt-1">
                  produit : {c.produces.join(', ')}
                </div>
              </button>
            </li>
          ))}
        </ul>

        {chosen ? (
          <form onSubmit={onSubmit} className="space-y-3" aria-label="chain-launch">
            {chosen.scopeAcknowledgement ? (
              <p className="text-sm text-amber-400" role="status">
                {chosen.scopeAcknowledgement}
              </p>
            ) : null}
            <div className="flex items-center gap-2">
              <input
                aria-label="target"
                className="w-full bg-slate-800 rounded-full px-5 py-3 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                placeholder="Cible : domaine, URL, IP…"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
              />
              <button
                type="submit"
                disabled={!canSubmit}
                className="shrink-0 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 rounded-full px-5 py-3 font-medium"
              >
                {loading ? 'Démarrage…' : 'Lancer'}
              </button>
            </div>
            {error ? (
              <p className="text-sm text-red-400" role="alert">
                {error.message}
              </p>
            ) : null}
            <details className="bg-slate-900 rounded p-3">
              <summary className="cursor-pointer text-sm text-slate-300 select-none">
                Guardrails
              </summary>
              <div className="mt-3">
                <GuardrailsPanel value={guardrails} onChange={setGuardrails} />
              </div>
            </details>
          </form>
        ) : (
          <p className="text-sm text-slate-500">Choisis une chaîne pour la lancer.</p>
        )}
      </div>
    </div>
  );
}
