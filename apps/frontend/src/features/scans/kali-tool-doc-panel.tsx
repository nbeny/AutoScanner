import { useQuery } from '@apollo/client';
import { KALI_TOOL_QUERY } from '../../lib/graphql/queries';

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

/**
 * Collapsible Kali documentation for a scanner's underlying binary (SP1
 * `kaliToolRef` → `kaliTool(binary)`): description, homepage, best-effort option
 * reference, and the raw `-h`/man help. Renders nothing until the tool resolves
 * (or when the binary is not in the Kali dataset).
 */
export function KaliToolDocPanel({ binary }: { binary: string }) {
  const { data } = useQuery<{ kaliTool: KaliToolDetail | null }>(KALI_TOOL_QUERY, {
    variables: { binary },
  });
  const tool = data?.kaliTool ?? null;
  if (!tool) return null;

  return (
    <details
      aria-label="kali-doc-panel"
      className="rounded border border-space-800 bg-space-900/50 p-3 text-xs"
    >
      <summary className="cursor-pointer text-slate-300">
        Doc Kali / aide — <span className="font-mono">{tool.displayName}</span>
      </summary>
      <div className="mt-2 space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-slate-400">{tool.description}</p>
          {tool.homepage ? (
            <a
              href={tool.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-neon-cyan hover:underline"
            >
              homepage ↗
            </a>
          ) : null}
        </div>

        {tool.options.length > 0 ? (
          <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5">
            {tool.options.slice(0, 60).map((o) => (
              <div key={o.flag} className="contents">
                <dt className="font-mono text-slate-300">
                  {o.flag}
                  {o.argHint ? <span className="text-slate-500"> {o.argHint}</span> : null}
                </dt>
                <dd className="text-slate-500">{o.description}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {tool.helpTextRaw ? (
          <pre className="max-h-72 overflow-auto rounded bg-space-900 p-2 font-mono text-slate-400 whitespace-pre-wrap">
            {tool.helpTextRaw}
          </pre>
        ) : null}
      </div>
    </details>
  );
}
