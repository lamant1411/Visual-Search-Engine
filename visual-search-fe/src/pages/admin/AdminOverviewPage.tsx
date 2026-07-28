import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { LayoutDashboard, Database, Users, ArrowRight, ShieldCheck, UserCheck } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { adminApi, type AdminStats, type AdminUser, type IndexingStatus } from '@/lib/api/admin'

function CardSkeleton() {
  return (
    <div className="h-28 rounded-xl bg-surface-2 border border-border p-5 animate-pulse flex flex-col justify-between">
      <div className="h-4 bg-surface-1 rounded w-1/3" />
      <div className="h-8 bg-surface-1 rounded w-1/2" />
    </div>
  )
}

export default function AdminOverviewPage() {
  const [stats, setStats] = useState<AdminStats | null>(null)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [indexingStatus, setIndexingStatus] = useState<IndexingStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    async function loadData() {
      try {
        const [statsData, usersData, indexState] = await Promise.all([
          adminApi.getStats(),
          adminApi.listUsers({ page: 1, limit: 5 }),
          adminApi.getIndexingStatus(),
        ])
        setStats(statsData)
        setUsers(usersData.items)
        setIndexingStatus(indexState)
      } catch (err) {
        console.error('Lỗi khi tải dữ liệu tổng quan admin:', err)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  return (
    <PageContainer size="wide" className="space-y-6 py-5 sm:py-8">
      {/* Page Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-1 border border-border text-ink-primary shadow-xs">
            <LayoutDashboard className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-primary sm:text-2xl">
              Tổng quan Admin
            </h1>
            <p className="text-sm text-ink-secondary mt-1">
              Hệ thống quản trị và kiểm soát cơ sở dữ liệu tìm kiếm hình ảnh.
            </p>
          </div>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {isLoading ? (
          <>
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </>
        ) : (
          <>
            {/* Total Indexed Images */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-4 shadow-2xs transition-shadow hover:shadow-xs sm:p-5">
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                  Tổng số ảnh đã index
                </span>
                <p className="text-3xl font-bold font-display text-ink-primary">
                  {stats?.total_images.toLocaleString('vi-VN') || 0}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Database className="h-6 w-6" />
              </div>
            </div>

            {/* Total Users */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-4 shadow-2xs transition-shadow hover:shadow-xs sm:p-5">
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                  Tổng người dùng
                </span>
                <p className="text-3xl font-bold font-display text-ink-primary">
                  {stats?.total_users || 0}
                </p>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                <Users className="h-6 w-6" />
              </div>
            </div>

            {/* Current Indexing State */}
            <div className="flex items-center justify-between rounded-xl border border-border bg-surface-2 p-4 shadow-2xs transition-shadow hover:shadow-xs sm:p-5">
              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide">
                  Trạng thái Indexing
                </span>
                <div className="flex items-center gap-2">
                  <span className={`inline-block h-2.5 w-2.5 rounded-full ${
                    indexingStatus?.status === 'running' ? 'bg-amber-500 animate-pulse' :
                    indexingStatus?.status === 'completed' ? 'bg-emerald-500' :
                    indexingStatus?.status === 'failed' ? 'bg-red-500' : 'bg-gray-400'
                  }`} />
                  <p className="text-sm font-semibold text-ink-primary capitalize">
                    {indexingStatus?.status === 'running' ? `Đang chạy (${indexingStatus.progress}%)` :
                     indexingStatus?.status === 'completed' ? 'Hoàn thành' :
                     indexingStatus?.status === 'failed' ? 'Thất bại' : 'Đang chờ'}
                  </p>
                </div>
                <Link to="/admin/indexing" className="text-xs text-accent-600 hover:text-ink-primary font-medium inline-flex items-center gap-0.5 pt-1">
                  Quản lý Indexing <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Quick Access Area: User list (view only) & Status summary */}
      <div className="grid gap-6 xl:grid-cols-2">
        {/* User list */}
        <div className="space-y-4 rounded-xl border border-border bg-surface-2 p-4 shadow-2xs sm:p-5">
          <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-ink-muted" /> Người dùng mới gần đây
            </h2>
            <Link to="/admin/users" className="text-xs text-accent-600 hover:text-ink-primary font-semibold flex items-center gap-0.5">
              Xem tất cả <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="hidden overflow-x-auto sm:block">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-border text-ink-muted uppercase font-bold tracking-wider">
                  <th className="py-2.5 font-semibold">Email</th>
                  <th className="py-2.5 font-semibold">Vai trò</th>
                  <th className="py-2.5 font-semibold">Trạng thái</th>
                  <th className="py-2.5 font-semibold">Ngày tham gia</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {isLoading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i} className="animate-pulse">
                      <td className="py-3"><div className="h-3 bg-surface-1 rounded w-3/4" /></td>
                      <td className="py-3"><div className="h-3 bg-surface-1 rounded w-12" /></td>
                      <td className="py-3"><div className="h-3 bg-surface-1 rounded w-16" /></td>
                      <td className="py-3"><div className="h-3 bg-surface-1 rounded w-20" /></td>
                    </tr>
                  ))
                ) : users.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-4 text-center text-ink-muted italic">
                      Chưa có người dùng nào đăng ký.
                    </td>
                  </tr>
                ) : (
                  users.map((u) => (
                    <tr key={u.id} className="text-ink-secondary">
                      <td className="py-3 font-medium text-ink-primary">{u.email}</td>
                      <td className="py-3">
                        <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-3xs font-semibold ${
                          u.role === 'admin' ? 'bg-red-50 text-red-700 border border-red-100' : 'bg-blue-50 text-blue-700 border border-blue-100'
                        }`}>
                          {u.role.toUpperCase()}
                        </span>
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-3xs font-medium ${
                          u.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          <span className={`h-1 w-1 rounded-full ${u.is_active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
                          {u.is_active ? 'Đang hoạt động' : 'Tạm khóa'}
                        </span>
                      </td>
                      <td className="py-3 text-ink-muted">
                        {new Date(u.created_at).toLocaleDateString('vi-VN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="divide-y divide-border/60 sm:hidden">
            {isLoading ? (
              Array.from({ length: 3 }).map((_, index) => (
                <div key={index} className="space-y-2 py-4 first:pt-0">
                  <div className="h-4 w-3/4 animate-pulse rounded bg-surface-1" />
                  <div className="h-4 w-1/2 animate-pulse rounded bg-surface-1" />
                </div>
              ))
            ) : users.length === 0 ? (
              <p className="py-5 text-center text-sm italic text-ink-muted">
                Chưa có người dùng nào đăng ký.
              </p>
            ) : (
              users.map((user) => (
                <div key={user.id} className="space-y-2 py-4 first:pt-0">
                  <p className="break-all text-sm font-semibold text-ink-primary">{user.email}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                    <span className="font-semibold uppercase text-ink-secondary">{user.role}</span>
                    <span className={user.is_active ? 'text-emerald-700' : 'text-ink-muted'}>
                      {user.is_active ? 'Đang hoạt động' : 'Tạm khóa'}
                    </span>
                    <time className="w-full text-ink-muted">
                      {new Date(user.created_at).toLocaleDateString('vi-VN')}
                    </time>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* System & Search metrics summary */}
        <div className="space-y-4 rounded-xl border border-border bg-surface-2 p-4 shadow-2xs sm:p-5">
          <div className="border-b border-border pb-3">
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
              Thông tin hệ thống & Vector DB
            </h2>
          </div>
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 sm:gap-4">
              <div className="border border-border rounded-lg p-3 bg-surface-1/50">
                <p className="text-3xs font-bold text-ink-muted uppercase tracking-wider">Vector Dimension</p>
                <p className="text-lg font-bold text-ink-primary mt-1 font-display">512 (CLIP-ViT-B/32)</p>
              </div>
              <div className="border border-border rounded-lg p-3 bg-surface-1/50">
                <p className="text-3xs font-bold text-ink-muted uppercase tracking-wider">Môi trường</p>
                <p className="text-lg font-bold text-emerald-600 mt-1 font-display">Production</p>
              </div>
            </div>

            <div className="space-y-2.5">
              <div className="flex justify-between items-center text-xs">
                <span className="text-ink-secondary font-medium">Docker Containers</span>
                <span className="font-semibold text-emerald-600">4 / 4 Active</span>
              </div>
              <div className="w-full bg-surface-1 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full" style={{ width: '100%' }} />
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-ink-secondary font-medium">Dung lượng bộ nhớ Vector DB</span>
                <span className="font-semibold text-ink-primary">248.5 MB</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </PageContainer>
  )
}
