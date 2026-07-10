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
import { SearchResultsPage } from '@/features/search/pages/SearchResultsPage';
// import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
// import { AdminGuard } from '@/components/layout/AdminGuard';

const router = createBrowserRouter([
  // Trang public: ai cũng vào được
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/search" replace /> },
      { path: '/search', element: <SearchPage /> },
      { path: '/search/results', element: <SearchResultsPage /> },
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
          { path: '/history', element: <div>History page</div> },
        ],
      },
    ],
  },

  // Admin routes
  {
    element: <AdminGuard />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { path: '/admin', element: <div>Admin overview</div> },
          { path: '/admin/indexing', element: <div>Indexing status</div> },
          { path: '/admin/users', element: <div>User list</div> },
        ],
      },
    ],
  },

  { path: '*', element: <div>404 - Page not found</div> },
])

export function AppRouter() {
  return <RouterProvider router={router} />;
}
