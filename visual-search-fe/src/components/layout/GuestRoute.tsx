import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/contexts/AuthContext'

/**
 * GuestRoute
 * Dành cho các trang chỉ dành cho khách chưa đăng nhập (login, register).
 * - Nếu đang load session → chờ
 * - Nếu đã login → redirect về /search (không cho vào /login, /register nữa)
 * - Nếu chưa login → render Outlet bình thường
 */
export function GuestRoute() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f3ff]">
        <div className="w-8 h-8 rounded-full border-2 border-[#7c3aed] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (isAuthenticated) {
    return <Navigate to="/search" replace />
  }

  return <Outlet />
}
