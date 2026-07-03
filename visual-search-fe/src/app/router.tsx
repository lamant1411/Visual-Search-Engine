import { createBrowserRouter, RouterProvider, Navigate } from 'react-router';
import { AppShell } from '@/components/layout/AppShell';
import { AdminShell } from '@/components/layout/AdminShell';
import { SearchPage } from '@/features/search/pages/SearchPage';
// import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
// import { AdminGuard } from '@/components/layout/AdminGuard';

const router = createBrowserRouter([
  {
    element: <AppShell />, // Header only
    children: [
      // "/" chưa có page riêng -> tự chuyển hướng sang /search
      { index: true, element: <Navigate to="/search" replace /> },
      { path: '/login', element: <div>Login page</div> },
      { path: '/register', element: <div>Register page</div> },
      { path: '/search', element: <SearchPage /> },
      {
        path: '/history',
        element: <div>History page</div>,
        // element: <ProtectedRoute><HistoryPage /></ProtectedRoute>, // bật sau khi có AuthContext
      },
    ],
  },
  {
    element: <AdminShell />, // Header + Sidebar
    // element: <ProtectedRoute><AdminGuard><AdminShell /></AdminGuard></ProtectedRoute>,
    children: [
      { path: '/admin', element: <div>Admin overview</div> },
      { path: '/admin/indexing', element: <div>Indexing status</div> },
      { path: '/admin/users', element: <div>User list</div> },
    ],
  },
  // Bắt mọi đường dẫn không khớp route nào ở trên (thay vì 404 mặc định của React Router)
  { path: '*', element: <div>404 - Không tìm thấy trang</div> },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
