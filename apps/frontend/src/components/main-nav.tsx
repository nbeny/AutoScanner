import { Link } from 'react-router-dom';

const SECTIONS: Array<{ to: string; label: string }> = [
  { to: '/dashboard', label: 'Dashboard' },
  { to: '/scans', label: 'Scans' },
  { to: '/vulnerabilities', label: 'Vulnérabilités' },
  { to: '/tools', label: 'Outils' },
  { to: '/engagements', label: 'Engagements' },
  { to: '/settings', label: 'Settings' },
];

export interface MainNavProps {
  email: string;
  onLogout: () => void;
}

export function MainNav({ email, onLogout }: MainNavProps) {
  return (
    <nav className="bg-slate-900 px-6 py-3 flex items-center justify-between border-b border-slate-800">
      <div className="flex items-center gap-6">
        <span className="font-semibold">AutoScanner</span>
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to} className="text-sm text-slate-300 hover:text-white">
            {s.label}
          </Link>
        ))}
      </div>
      <div className="text-sm text-slate-400 flex items-center gap-3">
        <span>{email}</span>
        <button onClick={onLogout} className="hover:underline">
          Logout
        </button>
      </div>
    </nav>
  );
}
