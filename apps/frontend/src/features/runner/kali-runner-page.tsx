import { useMemo, useState } from 'react';
import { useMutation, useQuery } from '@apollo/client';
import { useNavigate } from 'react-router-dom';
import { useScope } from '../../lib/scope-context';
import {
  KALI_TOOLS_QUERY,
  KALI_TOOL_QUERY,
  RUN_KALI_TOOL_MUTATION,
} from '../../lib/graphql/queries';
import { tokenizeArgs } from './tokenize-args';

interface KaliToolSummary {
  binary: string;
  displayName: string;
  description: string;
  categories: string[];
  hasHelp: boolean;
}
interface KaliToolOption {
  flag: string;
  argHint: string | null;
  description: string;
}
interface KaliToolDetail {
  binary: string;
  displayName: string;
  description: string;
  homepage: string | null;
  helpTextRaw: string | null;
  options: KaliToolOption[];
}

const JSON_OPT_RE = /json|-oj\b|--?o\s*json/i;

export function KaliRunnerPage() {
  const { engagementId } = useScope();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [argsText, setArgsText] = useState('');
  const [jsonOutput, setJsonOutput] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  const { data: toolsData } = useQuery<{ kaliTools: KaliToolSummary[] }>(KALI_TOOLS_QUERY);
  const { data: detailData } = useQuery<{ kaliTool: KaliToolDetail | null }>(KALI_TOOL_QUERY, {
    skip: !selected,
    variables: selected ? { binary: selected } : undefined,
  });
  const [runKaliTool, { loading, error }] = useMutation(RUN_KALI_TOOL_MUTATION);

  const tools = toolsData?.kaliTools ?? [];
  const detail = detailData?.kaliTool ?? null;
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tools
      .filter((t) => !q || t.binary.includes(q) || t.description.toLowerCase().includes(q))
      .slice(0, 60);
  }, [tools, search]);

  const args = useMemo(() => tokenizeArgs(argsText), [argsText]);
  const jsonCapable = useMemo(
    () => (detail?.options ?? []).some((o) => JSON_OPT_RE.test(`${o.flag} ${o.description}`)),
    [detail],
  );

  const scoped = Boolean(engagementId);

  async function launch() {
    if (!engagementId || !selected) return;
    const res = await runKaliTool({
      variables: { input: { engagementId, binary: selected, args, jsonOutput } },
    });
    const run = res.data?.runKaliTool as { id: string } | undefined;
    if (run) navigate(`/runner/${run.id}`);
  }

  return (
    <div className="p-6 space-y-4 max-w-6xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">
          Kali <span className="text-neon-cyan">Runner</span>
        </h1>
        <p className="text-sm text-slate-400">
          Compose and run any Kali tool command in an isolated container.
        </p>
      </header>

      {!scoped ? (
        <p className="text-sm text-slate-500">Sélectionne un périmètre pour lancer un outil.</p>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(220px,1fr)_2fr] gap-4">
        {/* Tool picker */}
        <section aria-label="tool-picker" className="space-y-2">
          <input
            aria-label="tool-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="chercher un outil…"
            className="w-full rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm text-slate-100 font-mono"
          />
          <ul className="max-h-96 overflow-y-auto space-y-1">
            {filtered.map((t) => (
              <li key={t.binary}>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(t.binary);
                    setShowHelp(false);
                    setArgsText('');
                    setJsonOutput(false);
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
          </ul>
        </section>

        {/* Composer */}
        <section aria-label="composer" className="space-y-3">
          {detail ? (
            <>
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="font-mono text-lg text-slate-100">{detail.binary}</h2>
                {detail.homepage ? (
                  <a
                    href={detail.homepage}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs text-neon-cyan hover:underline"
                  >
                    homepage ↗
                  </a>
                ) : null}
              </div>
              <p className="text-sm text-slate-400">{detail.description}</p>

              {detail.options.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {detail.options.slice(0, 40).map((o) => (
                    <button
                      key={o.flag}
                      type="button"
                      title={o.description}
                      onClick={() =>
                        setArgsText((t) => `${t}${t && !t.endsWith(' ') ? ' ' : ''}${o.flag} `)
                      }
                      className="rounded border border-space-800 bg-space-900 px-2 py-0.5 text-xs font-mono text-slate-300 hover:border-neon-cyan/50"
                    >
                      {o.flag}
                      {o.argHint ? <span className="text-slate-500"> {o.argHint}</span> : null}
                    </button>
                  ))}
                </div>
              ) : null}

              <input
                aria-label="kali-args"
                value={argsText}
                onChange={(e) => setArgsText(e.target.value)}
                placeholder="arguments (ex. -sV scanme.example.com)"
                className="w-full rounded-md border border-space-800 bg-space-900 px-2 py-1 text-sm text-slate-100 font-mono"
              />

              {jsonCapable ? (
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  <input
                    type="checkbox"
                    aria-label="json-output"
                    checked={jsonOutput}
                    onChange={(e) => setJsonOutput(e.target.checked)}
                  />
                  sortie JSON
                </label>
              ) : null}

              <div className="rounded bg-space-900 px-3 py-2 text-xs font-mono text-slate-300 overflow-x-auto">
                <span className="text-neon-cyan">{detail.binary}</span> {args.join(' ')}
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void launch()}
                  disabled={!scoped || loading}
                  className="rounded-md bg-neon-cyan/20 px-4 py-1 text-sm text-neon-cyan hover:bg-neon-cyan/30 disabled:opacity-40"
                >
                  Run
                </button>
                {detail.helpTextRaw ? (
                  <button
                    type="button"
                    onClick={() => setShowHelp((v) => !v)}
                    className="text-xs text-slate-400 hover:text-slate-200"
                  >
                    {showHelp ? '▾ masquer' : '▸ afficher'} l&apos;aide / man
                  </button>
                ) : null}
              </div>

              {error ? (
                <p role="alert" className="text-xs text-rose-400">
                  {error.message}
                </p>
              ) : null}

              {showHelp && detail.helpTextRaw ? (
                <pre className="max-h-72 overflow-auto rounded bg-space-900 p-3 text-xs text-slate-300 font-mono whitespace-pre-wrap">
                  {detail.helpTextRaw}
                </pre>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-slate-500">Sélectionne un outil à gauche.</p>
          )}
        </section>
      </div>
    </div>
  );
}
