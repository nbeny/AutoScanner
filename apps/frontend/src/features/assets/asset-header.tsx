interface Props {
  kind: string;
  canonicalValue: string;
  riskScore: number;
  firstSeenAt: string;
  lastSeenAt: string;
  scannerSources: string[];
  deletedAt?: string | null;
}

const KIND_ICON: Record<string, string> = {
  DOMAIN: '🌐',
  SUBDOMAIN: '🔗',
  IP_ADDRESS: '🖥',
};

export function AssetHeader(p: Props) {
  const badge =
    p.riskScore >= 20 ? 'bg-red-700' : p.riskScore >= 10 ? 'bg-orange-600' : 'bg-slate-700';
  return (
    <div className="space-y-3">
      {p.deletedAt ? (
        <div
          role="alert"
          aria-label="asset-soft-deleted-banner"
          className="bg-amber-950 border border-amber-700 text-amber-200 rounded px-4 py-2 text-sm"
        >
          Supprimé le {p.deletedAt.slice(0, 10)} — affichage en lecture seule.
        </div>
      ) : null}
      <header className="bg-slate-900 rounded p-4 flex items-center gap-4">
        <span className="text-2xl">{KIND_ICON[p.kind] ?? '•'}</span>
        <h1 className="font-mono text-lg text-slate-100 flex-1 truncate">{p.canonicalValue}</h1>
        <span className={`px-2 py-1 rounded text-sm text-white ${badge}`}>
          risk {p.riskScore.toFixed(1)}
        </span>
        <div className="text-xs text-slate-400">
          first {p.firstSeenAt.slice(0, 10)} · last {p.lastSeenAt.slice(0, 10)}
        </div>
        <div className="flex gap-1">
          {p.scannerSources.map((s) => (
            <span key={s} className="text-[10px] bg-slate-800 rounded px-1.5 py-0.5">
              {s}
            </span>
          ))}
        </div>
      </header>
    </div>
  );
}
