// apps/frontend/src/features/runner/tool-result-view.tsx
export interface ParsedToolOutput {
  format: 'json' | 'table' | 'keyvalue' | 'text' | string;
  view: unknown;
}

interface TableView {
  headers: string[];
  rows: string[][];
}
interface KeyValueView {
  pairs: { key: string; value: string }[];
}
interface TextView {
  lines: string[];
}

export function ToolResultView({ parsed }: { parsed: ParsedToolOutput | null | undefined }) {
  if (!parsed || parsed.view == null) {
    return <p className="text-slate-500 text-sm">No output.</p>;
  }

  if (parsed.format === 'json') {
    return (
      <pre
        aria-label="tool-result-json"
        className="overflow-x-auto rounded bg-space-900 p-3 text-xs text-slate-200 font-mono"
      >
        {JSON.stringify(parsed.view, null, 2)}
      </pre>
    );
  }

  if (parsed.format === 'table') {
    const v = parsed.view as Partial<TableView>;
    const headers = Array.isArray(v?.headers) ? v.headers : [];
    const rows = Array.isArray(v?.rows) ? v.rows : [];
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="text-slate-400">
              {headers.map((h, i) => (
                <th key={i} className="px-3 py-1 font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-slate-200">
            {rows.map((row, ri) => (
              <tr key={ri} className="border-t border-space-800">
                {(Array.isArray(row) ? row : []).map((cell, ci) => (
                  <td key={ci} className="px-3 py-1">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (parsed.format === 'keyvalue') {
    const v = parsed.view as Partial<KeyValueView>;
    const pairs = Array.isArray(v?.pairs) ? v.pairs : [];
    return (
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1 text-sm">
        {pairs.map((p, i) => (
          <div key={i} className="contents">
            <dt className="text-slate-400">{p.key}</dt>
            <dd className="text-slate-200 font-mono break-all">{p.value}</dd>
          </div>
        ))}
      </dl>
    );
  }

  // text (and any unknown format) — render lines.
  const lines = ((parsed.view as TextView).lines ?? []).join('\n');
  return (
    <pre
      aria-label="tool-result-text"
      className="overflow-x-auto rounded bg-space-900 p-3 text-xs text-slate-200 font-mono whitespace-pre-wrap"
    >
      {lines}
    </pre>
  );
}
