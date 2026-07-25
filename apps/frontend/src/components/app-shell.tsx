import { Outlet } from 'react-router-dom';
import { NavRail } from './nav-rail';
import { Topbar } from './topbar';

export interface AppShellProps {
  email: string;
  onLogout: () => void;
}

export function AppShell({ email, onLogout }: AppShellProps) {
  return (
    <div className="min-h-screen bg-space-radial text-slate-100">
      <div className="flex min-h-screen">
        <aside className="w-16 shrink-0 border-r border-space-800 lg:w-52">
          <NavRail />
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <Topbar email={email} onLogout={onLogout} />
          <main className="min-w-0 flex-1">
            <Outlet />
          </main>
        </div>
      </div>
    </div>
  );
}
