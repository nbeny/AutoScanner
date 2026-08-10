import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { KALI_TOOLS_QUERY, RUN_KALI_TOOL_MUTATION } from '../../lib/graphql/queries';
import { ManOptionPalette } from '../scans/man-option-palette';
import { tokenizeArgs } from '../runner/tokenize-args';
import { curateKaliTools, type CockpitGroup, type KaliToolRow } from './kali-cockpit-catalog';

export interface KaliToolLauncherProps {
  engagementId?: string;
  group: CockpitGroup;
  onLaunched?: (runId: string) => void;
}

/**
 * Curated Kali-tool launcher shared by the Recon and OSINT cockpits: pick a tool
 * (filtered by `group`), compose args with the man-option palette, and launch it
 * via runKaliTool. Kali runs produce raw output (no normalized findings), like the
 * standalone Runner.
 */
export function KaliToolLauncher({ engagementId, group, onLaunched }: KaliToolLauncherProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [argsText, setArgsText] = useState('');

  const { data } = useQuery<{ kaliTools: KaliToolRow[] }>(KALI_TOOLS_QUERY);
  const [runKaliTool, { loading, error }] = useMutation(RUN_KALI_TOOL_MUTATION);

  const tools = useMemo(() => curateKaliTools(data?.kaliTools ?? [], group), [data, group]);
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (
      q
        ? tools.filter((t) => t.binary.includes(q) || t.description.toLowerCase().includes(q))
        : tools
    ).slice(0, 60);
  }, [tools, search]);

  const args = useMemo(() => tokenizeArgs(argsText), [argsText]);
  const scoped = Boolean(engagementId);

  async function launch() {
    if (!engagementId || !selected) return;
    const res = await runKaliTool({
      variables: { input: { engagementId, binary: selected, args, jsonOutput: false } },
    });
    const run = res.data?.runKaliTool as { id: string } | undefined;
    if (run) onLaunched?.(run.id);
  }

  return (
    <div
      aria-label="kali-tool-launcher"
      className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(180px,1fr)_2fr]"
    >
      {/* Picker */}
      <section className="space-y-2">
        <input
          aria-label="kali-tool-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="chercher un outil Kali…"
          className="w-full rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm font-mono text-slate-100"
        />
        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {filtered.map((t) => (
            <li key={t.binary}>
              <button
                type="button"
                aria-label={`kali-pick-${t.binary}`}
                onClick={() => {
                  setSelected(t.binary);
                  setArgsText('');
                }}
                className={`w-full rounded px-2 py-1 text-left text-sm font-mono ${
                  selected === t.binary
                    ? 'bg-neon-cyan/15 text-neon-cyan'
                    : 'text-slate-300 hover:bg-space-800/60'
                }`}
              >
                {t.binary}
                <span className="block truncate text-xs text-slate-500">{t.description}</span>
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li className="px-2 py-1 text-xs text-slate-500">Aucun outil.</li>
          ) : null}
        </ul>
      </section>

      {/* Composer */}
      <section className="space-y-2">
        {selected ? (
          <>
            <h3 className="font-mono text-sm text-slate-100">{selected}</h3>
            <ManOptionPalette
              binary={selected}
              onAddFlag={(f) => setArgsText((t) => (t ? `${t} ${f}` : f))}
            />
            <input
              aria-label="kali-args"
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              placeholder="arguments (ex. -d example.com)"
              className="w-full rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm font-mono text-slate-100"
            />
            <div className="rounded bg-space-900 px-3 py-2 text-xs font-mono text-slate-300 overflow-x-auto">
              <span className="text-neon-cyan">{selected}</span> {args.join(' ')}
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => void launch()}
                disabled={!scoped || loading}
                className="rounded-md bg-neon-cyan/20 px-4 py-1 text-sm text-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-40"
              >
                Lancer
              </button>
              {!scoped ? (
                <span className="text-xs text-slate-500">Sélectionne un périmètre.</span>
              ) : null}
            </div>
            {error ? (
              <p role="alert" className="text-xs text-rose-400">
                {error.message}
              </p>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-slate-500">Sélectionne un outil à gauche.</p>
        )}
      </section>
    </div>
  );
}
