import { useState } from 'react';
import { SCANNER_CATALOG } from './scanner-catalog';

interface ScannerSelectProps {
  value: string;
  onChange: (name: string) => void;
}

export function ScannerSelect({ value, onChange }: ScannerSelectProps) {
  const [search, setSearch] = useState('');

  const query = search.trim().toLowerCase();

  return (
    <div className="space-y-2">
      <input
        aria-label="scanner-search"
        type="text"
        placeholder="Search scanners…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-slate-800 rounded px-2 py-1 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
      />
      <div
        aria-label="scanner-select"
        className="max-h-64 overflow-auto rounded border border-slate-700 bg-slate-900 space-y-2 p-2"
      >
        {(Object.entries(SCANNER_CATALOG) as [string, string[]][]).map(([category, names]) => {
          const filtered = query ? names.filter((n) => n.toLowerCase().includes(query)) : names;

          if (filtered.length === 0) return null;

          return (
            <div key={category}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                {category}
              </p>
              <div className="flex flex-wrap gap-1">
                {filtered.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => onChange(name)}
                    className={
                      name === value
                        ? 'px-2 py-0.5 rounded text-xs font-medium ring-2 ring-indigo-400 bg-indigo-700 text-white'
                        : 'px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
