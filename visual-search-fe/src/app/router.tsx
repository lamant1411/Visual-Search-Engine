import { createBrowserRouter, RouterProvider, Navigate } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { AdminShell } from '@/components/layout/AdminShell';
import { AuthShell } from '@/components/layout/AuthShell';
import LoginPage from '@/pages/LoginPage';
import RegisterPage from '@/pages/RegisterPage';
// import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
// import { AdminGuard } from '@/components/layout/AdminGuard';

const router = createBrowserRouter([
  // ── Auth routes (no Header) ──────────────────────────────────────
  {
    element: <AuthShell />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },

  // ── App routes (with Header) ─────────────────────────────────────
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/search" replace /> },
      { path: '/search', element: <div>Search page</div> },
      {
        path: '/history',
        element: <div>History page</div>,
        // element: <ProtectedRoute><HistoryPage /></ProtectedRoute>,
      },
    ],
  },

  // ── Admin routes (Header + Sidebar) ─────────────────────────────
  {
    element: <AdminShell />,
    // element: <ProtectedRoute><AdminGuard><AdminShell /></AdminGuard></ProtectedRoute>,
    children: [
      { path: '/admin', element: <div>Admin overview</div> },
      { path: '/admin/indexing', element: <div>Indexing status</div> },
      { path: '/admin/users', element: <div>User list</div> },
    ],
  },

  { path: '*', element: <div>404 - Không tìm thấy trang</div> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
