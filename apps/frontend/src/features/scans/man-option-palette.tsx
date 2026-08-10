import { useMemo, useState } from 'react';
import { useQuery } from '@apollo/client';
import { KALI_TOOL_QUERY } from '../../lib/graphql/queries';

interface KaliToolOption {
  flag: string;
  argHint: string | null;
  description: string;
}
interface KaliToolDetail {
  binary: string;
  optionsSource?: string;
  options: KaliToolOption[];
}

/**
 * Clickable palette of a Kali binary's man/help-sourced options. Clicking a chip
 * appends its flag to the raw args (via onAddFlag). Renders nothing when the
 * scanner has no Kali binary or the binary is absent from the dataset.
 */
export function ManOptionPalette({
  binary,
  onAddFlag,
}: {
  binary: string | null;
  onAddFlag: (flag: string) => void;
}) {
  const [search, setSearch] = useState('');
  const { data } = useQuery<{ kaliTool: KaliToolDetail | null }>(KALI_TOOL_QUERY, {
    skip: !binary,
    variables: binary ? { binary } : undefined,
  });

  const options = data?.kaliTool?.options ?? [];
  const q = search.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      (q
        ? options.filter(
            (o) => o.flag.toLowerCase().includes(q) || o.description.toLowerCase().includes(q),
          )
        : options
      ).slice(0, 40),
    [options, q],
  );

  if (!binary || options.length === 0) return null;

  return (
    <div className="space-y-2" aria-label="man-option-palette">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-wide text-slate-500">
          Options (man) — clique pour ajouter
        </span>
        {options.length > 12 ? (
          <input
            aria-label="man-option-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="filtrer…"
            className="w-28 rounded border border-space-800 bg-space-900 px-2 py-0.5 text-xs text-slate-100 font-mono"
          />
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1">
        {filtered.map((o) => (
          <button
            key={o.flag}
            type="button"
            aria-label={`man-option-${o.flag}`}
            title={o.description}
            onClick={() => onAddFlag(o.flag)}
            className="rounded border border-space-800 bg-space-900 px-2 py-0.5 text-xs font-mono text-slate-300 hover:border-neon-cyan/50"
          >
            {o.flag}
            {o.argHint ? <span className="text-slate-500"> {o.argHint}</span> : null}
          </button>
        ))}
      </div>
    </div>
  );
}
