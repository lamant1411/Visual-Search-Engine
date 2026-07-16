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
import BookmarkPage from '@/pages/BookmarkPage';
import { SearchResultsPage } from '@/features/search/pages/SearchResultsPage';
import AdminOverviewPage from '@/pages/admin/AdminOverviewPage';
import AdminIndexingPage from '@/pages/admin/AdminIndexingPage';
import AdminUsersPage from '@/pages/admin/AdminUsersPage';

const router = createBrowserRouter([
  // Trang public: ai cũng vào được
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/search" replace /> },
      { path: '/search', element: <SearchPage /> },
    ],
  },
  // Auth routes: chỉ dành cho khách chưa login
  {
    element: <GuestRoute />,
    children: [
      {
        element: <AuthShell />,
        children: [
          { path: '/login', element: <LoginPage /> },
          { path: '/register', element: <RegisterPage /> },
        ],
      },
    ],
  },

  // Routes cần login
  {
    element: <ProtectedRoute />,
    children: [
      {
        element: <AppShell />,
        children: [
          { path: '/history', element: <HistoryPage /> },
          { path: '/bookmark', element: <BookmarkPage /> },
          { path: '/search/results', element: <SearchResultsPage /> },
          { path: '/history', element: <div>History page</div> },
        ],
      },
    ],
  },

  {
    element: <AppShell />,    // layout có Header
    children: [
      { path: '/admin', element: <AdminOverviewPage /> },
      { path: '/admin/indexing', element: <AdminIndexingPage /> },
      { path: '/admin/users', element: <AdminUsersPage /> },]
  },

  // ── Admin routes: yêu cầu login + role admin ─────────────────────
  {
    element: <AdminGuard />,
    children: [
      {
        element: <AdminShell />,
        children: [
          // { path: '/admin', element: <AdminOverviewPage /> },
          // { path: '/admin/indexing', element: <AdminIndexingPage /> },
          // { path: '/admin/users', element: <AdminUsersPage /> },
        ],
      },
    ],
  },

  { path: '*', element: <div>404 - Page not found</div> },
])

export function AppRouter() {
  return <RouterProvider router={router} />;
}
