import { Outlet } from 'react-router';
import { Header } from './Header';
import { Sidebar } from './Sidebar';

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
      <Header />
      <div className="mx-auto flex max-w-6xl">
        <Sidebar />
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
