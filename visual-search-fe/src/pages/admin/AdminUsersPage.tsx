import { useEffect, useState } from 'react'
import { Users, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { adminApi, type AdminUser } from '@/lib/api/admin'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchUsers = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await adminApi.listUsers({ page, limit })
      setUsers(res.items)
      setTotal(res.total)
    } catch (err) {
      console.error('Lỗi khi tải danh sách người dùng:', err)
      setError('Không thể tải danh sách người dùng.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [page])

  const totalPages = Math.ceil(total / limit)

  return (
    <PageContainer size="wide" className="py-8 space-y-6">
      {/* Page Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-1 border border-border text-ink-primary shadow-xs">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink-primary">
              Danh sách Người dùng
            </h1>
            <p className="text-sm text-ink-secondary mt-1">
              Xem danh sách người dùng đã đăng ký tài khoản trên hệ thống (Quyền chỉ xem).
            </p>
          </div>
        </div>
      </div>

      {/* Lỗi */}
      {error && (
        <div className="flex items-start gap-2 p-4 border border-red-100 bg-red-50 text-red-700 text-sm rounded-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Users table list */}
      <div className="bg-surface-2 rounded-xl border border-border shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-1/40 border-b border-border text-ink-muted uppercase font-bold tracking-wider">
                <th className="px-6 py-3.5 font-semibold">Mã người dùng (ID)</th>
                <th className="px-6 py-3.5 font-semibold">Địa chỉ Email</th>
                <th className="px-6 py-3.5 font-semibold">Vai trò</th>
                <th className="px-6 py-3.5 font-semibold">Trạng thái</th>
                <th className="px-6 py-3.5 font-semibold">Ngày tạo tài khoản</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-3.5 bg-surface-1 rounded w-24" /></td>
                    <td className="px-6 py-4"><div className="h-3.5 bg-surface-1 rounded w-48" /></td>
                    <td className="px-6 py-4"><div className="h-3.5 bg-surface-1 rounded w-12" /></td>
                    <td className="px-6 py-4"><div className="h-3.5 bg-surface-1 rounded w-16" /></td>
                    <td className="px-6 py-4"><div className="h-3.5 bg-surface-1 rounded w-20" /></td>
                  </tr>
                ))
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-ink-muted italic">
                    Chưa có người dùng nào được tạo.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id} className="text-ink-secondary hover:bg-surface-1/10 transition-colors">
                    <td className="px-6 py-4 font-mono text-ink-muted text-3xs select-all">{u.id}</td>
                    <td className="px-6 py-4 font-medium text-ink-primary">{u.email}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-3xs font-semibold ${
                        u.role === 'admin'
                          ? 'bg-red-50 text-red-700 border border-red-100'
                          : 'bg-blue-50 text-blue-700 border border-blue-100'
                      }`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-medium ${
                        u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        <span className={`h-1 w-1 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                        {u.is_active ? 'Đang hoạt động' : 'Tạm khóa'}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-ink-muted">
                      {new Date(u.created_at).toLocaleString('vi-VN')}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination bar */}
        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between border-t border-border px-6 py-3.5 bg-surface-1/10">
            <span className="text-2xs text-ink-muted">
              Hiển thị <span className="font-semibold text-ink-secondary">{users.length}</span> trên{' '}
              <span className="font-semibold text-ink-secondary">{total}</span> người dùng
            </span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="flex items-center justify-center h-7 w-7 rounded-lg border border-border text-ink-secondary hover:bg-surface-1 hover:text-ink-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="text-xs font-medium text-ink-secondary px-2">
                Trang {page} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="flex items-center justify-center h-7 w-7 rounded-lg border border-border text-ink-secondary hover:bg-surface-1 hover:text-ink-primary disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  )
}
