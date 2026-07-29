import { useEffect, useState } from 'react'
import { AlertCircle, Users } from 'lucide-react'

import { Pagination } from '@/components/feature/result/pagination'
import { PageContainer } from '@/components/layout/PageContainer'
import { adminApi, type AdminUser } from '@/lib/api/admin'

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [limit] = useState(10)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let isCancelled = false
    const fetchUsers = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const res = await adminApi.listUsers({ page, limit })
        if (!isCancelled) {
          setUsers(res.items)
          setTotal(res.total)
        }
      } catch (err) {
        console.error('Lỗi khi tải danh sách người dùng:', err)
        if (!isCancelled) {
          setError('Không thể tải danh sách người dùng.')
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false)
        }
      }
    }
    void fetchUsers()
    return () => {
      isCancelled = true
    }
  }, [page, limit])

  const totalPages = Math.ceil(total / limit)

  return (
    <PageContainer size="wide" className="space-y-6 py-5 sm:py-8">
      {/* Page Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-1 border border-border text-ink-primary shadow-xs">
            <Users className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-primary sm:text-2xl">
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
      <div className="overflow-hidden rounded-xl border border-border bg-surface-2 shadow-2xs">
        <div className="hidden overflow-x-auto md:block">
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
                      <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-3xs font-semibold ${u.role === 'admin'
                        ? 'bg-red-50 text-red-700 border border-red-100'
                        : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                        {u.role.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-medium ${u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
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

        <div className="divide-y divide-border/60 md:hidden">
          {isLoading ? (
            Array.from({ length: 5 }).map((_, index) => (
              <div key={index} className="space-y-3 p-4">
                <div className="h-4 w-3/4 animate-pulse rounded bg-surface-1" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-surface-1" />
              </div>
            ))
          ) : users.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm italic text-ink-muted">
              Chưa có người dùng nào được tạo.
            </p>
          ) : (
            users.map((user) => (
              <article key={user.id} className="space-y-3 p-4">
                <div>
                  <p className="break-all text-sm font-semibold text-ink-primary">{user.email}</p>
                  <p className="mt-1 break-all font-mono text-xs text-ink-muted">ID: {user.id}</p>
                </div>
                <dl className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <dt className="font-semibold text-ink-muted">Vai trò</dt>
                    <dd className="mt-1 font-bold uppercase text-ink-secondary">{user.role}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-muted">Trạng thái</dt>
                    <dd className={`mt-1 font-semibold ${user.is_active ? 'text-emerald-700' : 'text-ink-muted'}`}>
                      {user.is_active ? 'Đang hoạt động' : 'Tạm khóa'}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className="font-semibold text-ink-muted">Ngày tạo tài khoản</dt>
                    <dd className="mt-1 text-ink-secondary">
                      {new Date(user.created_at).toLocaleString('vi-VN')}
                    </dd>
                  </div>
                </dl>
              </article>
            ))
          )}
        </div>

        {/* Pagination bar */}
        {!isLoading && totalPages > 1 && (
          <div className="border-t border-border bg-surface-1/10 px-4 py-4 sm:px-6">
            <p className="mb-3 text-center text-xs text-ink-muted sm:text-left">
              Hiển thị <span className="font-semibold text-ink-secondary">{users.length}</span> trên{' '}
              <span className="font-semibold text-ink-secondary">{total}</span> người dùng
            </p>
            <Pagination
              ariaLabel="Các trang người dùng"
              className="border-0 pt-0"
              nextLabel="Sau"
              page={page}
              previousLabel="Trước"
              totalPages={totalPages}
              onChange={setPage}
            />
          </div>
        )}
      </div>
    </PageContainer>
  )
}
