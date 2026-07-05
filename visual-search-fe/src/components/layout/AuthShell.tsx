import { Outlet } from 'react-router'

/**
 * Layout dành riêng cho các trang xác thực (login, register).
 * Không có Header/Sidebar — full-screen, centered content.
 */
export function AuthShell() {
  return (
    <div className="min-h-screen bg-[#f5f3ff] flex items-center justify-center p-4">
      {/* Decorative blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 overflow-hidden"
      >
        <div className="absolute -top-40 -left-40 w-[600px] h-[600px] rounded-full bg-[#ede9fe] opacity-60 blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full bg-[#ddd6fe] opacity-50 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full bg-[#c4b5fd] opacity-20 blur-2xl" />
      </div>

      <div className="relative z-10 w-full">
        <Outlet />
      </div>
    </div>
  )
}
