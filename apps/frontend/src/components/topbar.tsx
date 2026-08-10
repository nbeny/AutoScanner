export interface TopbarProps {
  email: string;
  onLogout: () => void;
  /** Active engagement name, shown as read-only context (single-operator: no picker). */
  engagementName?: string;
}

export function Topbar({ email, onLogout, engagementName }: TopbarProps) {
  return (
    <header
      aria-label="topbar"
      className="flex items-center justify-between border-b border-space-800 bg-space-900/70 px-6 py-3"
    >
      <div className="flex items-center gap-5">
        <span className="font-semibold tracking-wide text-slate-100">AutoScanner</span>
        {engagementName ? (
          <span
            aria-label="active-scope"
            className="flex items-center gap-2 text-sm text-slate-300"
          >
            <span className="text-xs uppercase tracking-wide text-slate-500">Périmètre</span>
            <span className="rounded-md border border-space-800 bg-space-900 px-2 py-1 text-slate-100">
              {engagementName}
            </span>
          </span>
        ) : null}
      </div>
      <div className="flex items-center gap-3 text-sm text-slate-400">
        <span>{email}</span>
        <button type="button" onClick={onLogout} className="hover:text-white">
          Logout
        </button>
      </div>
    </header>
  );
}
