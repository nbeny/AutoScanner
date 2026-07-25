import { NavLink } from 'react-router-dom';

export interface NavRailItem {
  to: string;
  label: string;
  icon: string;
}

export const NAV_ITEMS: NavRailItem[] = [
  { to: '/', label: 'Cockpit', icon: '◎' },
  { to: '/targets', label: 'Cibles', icon: '⌖' },
  { to: '/audit', label: 'Audit', icon: '❖' },
  { to: '/tools', label: 'Outils', icon: '⚙' },
  { to: '/hunt', label: 'AutoHunt', icon: '⚡' },
  { to: '/settings', label: 'Settings', icon: '⋯' },
];

export function NavRail() {
  return (
    <nav aria-label="primary" className="flex flex-col gap-1 p-2">
      {NAV_ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
              isActive
                ? 'bg-neon-cyan/10 text-neon-cyan shadow-glow-cyan'
                : 'text-slate-400 hover:bg-space-800/60 hover:text-slate-100'
            }`
          }
        >
          <span aria-hidden className="text-lg leading-none">
            {item.icon}
          </span>
          <span className="hidden lg:inline">{item.label}</span>
        </NavLink>
      ))}
    </nav>
  );
}
