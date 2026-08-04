import { Outlet } from 'react-router';
import { Header } from './Header';
import { Sidebar } from './Sidebar';
import { AdminIndexingIndicator } from './AdminIndexingIndicator';
import { RouteFocusManager } from './RouteFocusManager';
import { SkipLink } from './SkipLink';

/**
 * Layout riêng cho khu vực Admin (/admin/*).
 * Khác AppShell ở chỗ có thêm Sidebar điều hướng bên trái.
 *
 * Lưu ý: việc chặn user không phải admin KHÔNG nằm ở đây.
 * AdminShell chỉ lo hiển thị — kiểm tra quyền để ở AdminGuard,
 * bọc bên ngoài route /admin trong router.tsx.
 */
export function AdminShell() {
  return (
    <div className="min-h-screen bg-surface-0">
      <SkipLink />
      <RouteFocusManager />
      <Header />
      <div className="mx-auto flex max-w-7xl flex-col md:flex-row">
        <Sidebar />
        <main id="main-content" className="min-w-0 flex-1" tabIndex={-1}>
          <Outlet />
        </main>
      </div>
      <AdminIndexingIndicator />
    </div>
  );
}
