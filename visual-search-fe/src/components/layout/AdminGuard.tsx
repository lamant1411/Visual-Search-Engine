import { Navigate, Outlet } from 'react-router'
import { useAuth } from '@/contexts/AuthContext'

/**
 * AdminGuard
 * Bảo vệ các route /admin/*.
 * - Yêu cầu đã đăng nhập VÀ có role = 'admin'
 * - Nếu chưa login → redirect /login
 * - Nếu đã login nhưng không phải admin → redirect /search (403 silent)
 * - Nếu là admin → render Outlet
 */
export function AdminGuard() {
  const { isAuthenticated, isLoading, user } = useAuth()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f3ff]">
        <div className="w-8 h-8 rounded-full border-2 border-[#7c3aed] border-t-transparent animate-spin" />
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  if (user?.role !== 'admin') {
    return <Navigate to="/search" replace />
  }

  return <Outlet />
}
