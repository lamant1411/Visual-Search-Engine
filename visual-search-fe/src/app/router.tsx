import { lazy, Suspense } from "react";
import { createBrowserRouter, RouterProvider, Navigate } from "react-router";
import { AppShell } from "@/components/layout/AppShell";
import { AdminShell } from "@/components/layout/AdminShell";
import { AuthShell } from "@/components/layout/AuthShell";
import { ProtectedRoute } from "@/components/layout/ProtectedRoute";
import { GuestRoute } from "@/components/layout/GuestRoute";
import { AdminGuard } from "@/components/layout/AdminGuard";

const LoginPage = lazy(() => import("@/pages/LoginPage"));
const RegisterPage = lazy(() => import("@/pages/RegisterPage"));
const HistoryPage = lazy(() => import("@/pages/HistoryPage"));
const BookmarkPage = lazy(() => import("@/pages/BookmarkPage"));
const AdminOverviewPage = lazy(() => import("@/pages/admin/AdminOverviewPage"));
const AdminIndexingPage = lazy(() => import("@/pages/admin/AdminIndexingPage"));
const AdminUsersPage = lazy(() => import("@/pages/admin/AdminUsersPage"));
const SearchPage = lazy(() =>
  import("@/features/search/pages/SearchPage").then((module) => ({
    default: module.SearchPage,
  })),
);
const SearchResultsPage = lazy(() =>
  import("@/features/search/pages/SearchResultsPage").then((module) => ({
    default: module.SearchResultsPage,
  })),
);

const router = createBrowserRouter([
  // Trang public: ai cũng vào được
  {
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/search" replace /> },
      { path: "/search", element: <SearchPage /> },
    ],
  },
  // Auth routes: chỉ dành cho khách chưa login
  {
    element: <GuestRoute />,
    children: [
      {
        element: <AuthShell />,
        children: [
          { path: "/login", element: <LoginPage /> },
          { path: "/register", element: <RegisterPage /> },
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
          { path: "/history", element: <HistoryPage /> },
          { path: "/bookmark", element: <BookmarkPage /> },
          { path: "/search/results", element: <SearchResultsPage /> },
        ],
      },
    ],
  },

  // ── Admin routes: yêu cầu login + role admin ─────────────────────
  {
    element: <AdminGuard />,
    children: [
      {
        element: <AdminShell />,
        children: [
          { path: "/admin", element: <AdminOverviewPage /> },
          { path: "/admin/indexing", element: <AdminIndexingPage /> },
          { path: "/admin/users", element: <AdminUsersPage /> },
        ],
      },
    ],
  },

  { path: "*", element: <div>404 - Page not found</div> },
]);

export function AppRouter() {
  return (
    <Suspense fallback={<RouteLoading />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}

function RouteLoading() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-surface-0"
      role="status"
    >
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-accent-600 border-t-transparent" />
        <p className="text-sm font-semibold text-ink-secondary">
          Loading page...
        </p>
      </div>
    </div>
  );
}
