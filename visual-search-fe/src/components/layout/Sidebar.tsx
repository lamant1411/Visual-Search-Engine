import { NavLink } from 'react-router';
import { LayoutDashboard, Database, Users } from 'lucide-react';

const navItems = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/indexing', label: 'Indexing', icon: Database },
  { to: '/admin/users', label: 'Users', icon: Users },
];

export function Sidebar() {
  return (
    <aside className="w-56 shrink-0 border-r border-border bg-surface-2 p-4">
      <nav className="flex flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex items-center gap-2.5 rounded-[10px] px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-accent-100 text-accent-700'
                  : 'text-ink-secondary hover:bg-surface-1 hover:text-ink-primary',
              ].join(' ')
            }
          >
            <Icon className="h-4 w-4" />
            {label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
