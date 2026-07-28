import { NavLink } from 'react-router';
import { LayoutDashboard, Database, Users } from 'lucide-react';

const navItems = [
  { to: '/admin', label: 'Tổng quan', icon: LayoutDashboard, end: true },
  { to: '/admin/indexing', label: 'Indexing', icon: Database },
  { to: '/admin/users', label: 'Users', icon: Users },
];

export function Sidebar() {
  return (
    <>
      <nav
        aria-label="Điều hướng quản trị"
        className="sticky top-16 z-30 grid grid-cols-3 border-b border-border bg-white/95 px-2 py-2 backdrop-blur-md md:hidden"
      >
        {navItems.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              [
                'flex min-h-11 min-w-0 items-center justify-center gap-1.5 rounded-md px-2 text-xs font-semibold transition-colors',
                isActive
                  ? 'bg-accent-100 text-accent-700 shadow-sm'
                  : 'text-ink-secondary hover:bg-surface-1 hover:text-ink-primary',
              ].join(' ')
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      <aside className="hidden w-52 shrink-0 border-r border-border bg-surface-2 p-4 md:block lg:w-56">
        <nav aria-label="Điều hướng quản trị" className="sticky top-20 flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                [
                  'flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm font-medium transition-colors',
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
    </>
  );
}
