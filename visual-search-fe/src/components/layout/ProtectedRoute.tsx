import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from '@/contexts/AuthContext'

/**
 * ProtectedRoute
 * Bảo vệ các route yêu cầu đăng nhập.
 * - Nếu đang load session (isLoading) → hiện spinner tạm
 * - Nếu chưa login → redirect /login, giữ lại URL gốc trong `state.from`
 *   để sau khi login xong có thể quay lại trang user muốn vào.
 * - Nếu đã login → render children (Outlet)
 */
export function ProtectedRoute() {
  const { isLoading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f5f3ff]">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 rounded-full border-2 border-[#7c3aed] border-t-transparent animate-spin" />
          <p className="text-sm text-[#6b7280]">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (!isAuthenticated) {
    // Lưu URL hiện tại để sau khi login có thể redirect về đúng trang
    return <Navigate to="/login" state={{ from: location }} replace />
  }

  return <Outlet />
}
