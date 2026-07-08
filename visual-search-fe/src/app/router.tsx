import { createBrowserRouter, RouterProvider, Navigate } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { AdminShell } from '@/components/layout/AdminShell';
import { AuthShell } from '@/components/layout/AuthShell';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import { GuestRoute } from '@/components/layout/GuestRoute';
import { AdminGuard } from '@/components/layout/AdminGuard';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
import { SearchPage } from '@/features/search/pages/SearchPage';
import HistoryPage from '@/pages/HistoryPage';
// import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
// import { AdminGuard } from '@/components/layout/AdminGuard';

const router = createBrowserRouter([
  // ── Auth routes: chỉ dành cho khách chưa login ───────────────────
  {
    element: <GuestRoute />,      // redirect về /search nếu đã login
    children: [
      // "/" chưa có page riêng -> tự chuyển hướng sang /search
      { index: true, element: <Navigate to="/search" replace /> },
      {
        element: <AuthShell />,   // layout nền tím, không Header
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
      { path: '/search', element: <SearchPage /> },
    ],
  },

  // ── App routes: yêu cầu đăng nhập ───────────────────────────────
  {
    element: <ProtectedRoute />,  // redirect về /login nếu chưa login
    children: [
      {
        element: <AppShell />,    // layout có Header
        children: [
          { index: true, element: <Navigate to="/search" replace /> },
          { path: '/search', element: <div>Search page</div> },
          // { path: '/history', element: <HistoryPage /> },
        ],
      },
    ],
  },

  {
    element: <AppShell />,    // layout có Header
    children: [{ path: '/history', element: <HistoryPage /> },]
  },

  // ── Admin routes: yêu cầu login + role admin ─────────────────────
  {
    element: <AdminGuard />,      // redirect /login nếu chưa login, /search nếu không phải admin
    children: [
      {
        element: <AdminShell />,  // layout có Header + Sidebar
        children: [
          { path: '/admin', element: <div>Admin overview</div> },
          { path: '/admin/indexing', element: <div>Indexing status</div> },
          { path: '/admin/users', element: <div>User list</div> },
        ],
      },
    ],
  },

  { path: '*', element: <div>404 - Không tìm thấy trang</div> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
