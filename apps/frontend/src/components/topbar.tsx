import { ScopeSelector } from '../features/scope/scope-selector';

export interface TopbarProps {
  email: string;
  onLogout: () => void;
}

export function Topbar({ email, onLogout }: TopbarProps) {
  return (
    <header
      aria-label="topbar"
      className="flex items-center justify-between border-b border-space-800 bg-space-900/70 px-6 py-3"
    >
      <div className="flex items-center gap-5">
        <span className="font-semibold tracking-wide text-slate-100">AutoScanner</span>
        <ScopeSelector />
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
