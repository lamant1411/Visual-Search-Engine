import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Trash2, AlertCircle } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { HistoryFilters } from '@/components/feature/history/HistoryFilters'
import { HistoryList } from '@/components/feature/history/HistoryList'
import { useHistory } from '@/features/history/useHistory'
import type { SearchQueryType, HistoryItem } from '@/lib/api/history'

type FilterType = 'all' | SearchQueryType

export default function HistoryPage() {
  const navigate = useNavigate()
  const { items, isLoading, error, deletingIds, isDeletingAll, deleteItem, deleteAll } =
    useHistory()

  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

  // Lọc items ở client side
  const filteredItems = items.filter((item) => {
    if (activeFilter === 'all') return true
    return item.query_type === activeFilter
  })

  // Điều hướng về trang search kèm query cũ
  const handleReSearch = (item: HistoryItem) => {
    navigate('/search', {
      state: {
        queryType: item.query_type,
        queryValue: item.query_value,
        autoSubmit: true,
      },
    })
  }

  return (
    <PageContainer size="default" className="py-8 space-y-6">
      {/* Header trang */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-2xl font-bold text-ink-primary tracking-tight">
            Lịch sử tìm kiếm
          </h1>
          <p className="text-sm text-ink-secondary mt-1">
            Xem và quản lý các yêu cầu tìm kiếm hình ảnh, văn bản và ký tự đã thực hiện.
          </p>
        </div>

        {/* Nút xóa tất cả */}
        {items.length > 0 && (
          <button
            type="button"
            onClick={deleteAll}
            disabled={isDeletingAll}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-red-600 border border-red-200 bg-red-50 hover:bg-red-100/70 disabled:opacity-50 transition-all duration-150 rounded-sm cursor-pointer"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>{isDeletingAll ? 'Đang xóa...' : 'Xóa toàn bộ'}</span>
          </button>
        )}
      </div>

      {/* Lỗi nếu xảy ra */}
      {error && (
        <div className="flex items-start gap-2 p-4 border border-red-100 bg-red-50 text-red-700 text-sm rounded-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Bộ lọc loại tìm kiếm */}
      <HistoryFilters activeFilter={activeFilter} onChange={setActiveFilter} />

      {/* Danh sách lịch sử hiển thị */}
      <HistoryList
        items={filteredItems}
        isLoading={isLoading}
        deletingIds={deletingIds}
        onDelete={deleteItem}
        onReSearch={handleReSearch}
      />
    </PageContainer>
  )
}
