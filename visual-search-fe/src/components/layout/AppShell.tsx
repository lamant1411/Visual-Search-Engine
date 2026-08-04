import { Outlet } from 'react-router';
import { Header } from './Header';
import { RouteFocusManager } from './RouteFocusManager';
import { SkipLink } from './SkipLink';

/**
 * Layout mặc định cho toàn app (trừ /admin).
 * Dùng làm layout cha trong router.tsx cho: /login, /register, /search, /history
 */
export function AppShell() {
  return (
    <div className="min-h-screen bg-surface-0">
      <SkipLink />
      <RouteFocusManager />
      <Header />
      <main id="main-content" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}
