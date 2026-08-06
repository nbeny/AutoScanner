import { useMemo, useState } from 'react';
import { groupForCategories, type Category, type ScannerCatalogEntry } from './scanner-catalog';

interface ScannerSelectProps {
  entries: ScannerCatalogEntry[];
  value: string;
  onChange: (name: string) => void;
}

// Display order of the category groups.
const CATEGORY_ORDER: Category[] = [
  'DNS/Subdomains',
  'Ports/Network',
  'Web/HTTP',
  'TLS',
  'OSINT',
  'Cloud',
  'Active Directory',
  'Vuln/Exploit',
  'Other',
];

export function ScannerSelect({ entries, value, onChange }: ScannerSelectProps) {
  const [search, setSearch] = useState('');
  const query = search.trim().toLowerCase();

  // Group entries by display category, respecting CATEGORY_ORDER.
  const groups = useMemo(() => {
    const byCategory = new Map<Category, ScannerCatalogEntry[]>();
    for (const entry of entries) {
      const category = groupForCategories(entry.categories);
      if (!byCategory.has(category)) byCategory.set(category, []);
      byCategory.get(category)!.push(entry);
    }
    return CATEGORY_ORDER.filter((c) => byCategory.has(c)).map(
      (category) =>
        [category, byCategory.get(category)!.sort((a, b) => a.name.localeCompare(b.name))] as const,
    );
  }, [entries]);

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
        {groups.map(([category, group]) => {
          const filtered = query
            ? group.filter((e) => e.name.toLowerCase().includes(query))
            : group;
          if (filtered.length === 0) return null;

          return (
            <div key={category}>
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">
                {category}
              </p>
              <div className="flex flex-wrap gap-1">
                {filtered.map((entry) => (
                  <button
                    key={entry.name}
                    type="button"
                    title={entry.description}
                    onClick={() => onChange(entry.name)}
                    className={
                      entry.name === value
                        ? 'px-2 py-0.5 rounded text-xs font-medium ring-2 ring-indigo-400 bg-indigo-700 text-white'
                        : 'px-2 py-0.5 rounded text-xs font-medium bg-slate-700 text-slate-200 hover:bg-slate-600'
                    }
                  >
                    {entry.name}
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
