import { Outlet } from 'react-router';
import { Header } from './Header';

/**
 * Layout mặc định cho toàn app (trừ /admin).
 * Dùng làm layout cha trong router.tsx cho: /login, /register, /search, /history
 */
export function AppShell() {
  return (
    <div className="min-h-screen bg-surface-0">
      <Header />
      <main>
        <Outlet />
      </main>
    </div>
  );
}
