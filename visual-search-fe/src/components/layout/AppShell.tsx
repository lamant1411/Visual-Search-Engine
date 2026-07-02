import { Outlet, NavLink } from 'react-router'
import { Search, History, Shield } from 'lucide-react'

export function AppShell() {
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Visual Search</div>

        {/* <nav className="nav">
          <NavLink to="/search">
            <Search size={18} />
            Search
          </NavLink>

          <NavLink to="/history">
            <History size={18} />
            History
          </NavLink>

          <NavLink to="/admin">
            <Shield size={18} />
            Admin
          </NavLink>
        </nav> */}
      </aside>

      <main className="main-content">
        <Outlet />
      </main>
    </div>
  )
}