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
  const { items, isLoading, error, deletingIds, deleteItem, deleteMultiple } =
    useHistory()

  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const [selectedIds, setSelectedIds] = useState<number[]>([])

  // Lọc items ở client side
  const filteredItems = items.filter((item) => {
    if (activeFilter === 'all') return true
    return item.query_type === activeFilter
  })

  // Đảm bảo chỉ chứa các ID đang tồn tại thực tế
  const activeSelectedIds = selectedIds.filter((id) =>
    items.some((item) => item.id === id)
  )

  // Kiểm tra xem tất cả item hiển thị hiện tại đã được chọn chưa
  const filteredIds = filteredItems.map((item) => item.id)
  const isAllFilteredSelected =
    filteredIds.length > 0 &&
    filteredIds.every((id) => activeSelectedIds.includes(id))

  // Toggle chọn một item
  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((itemId) => itemId !== id) : [...prev, id]
    )
  }

  // Toggle chọn tất cả item hiển thị hiện tại
  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      setSelectedIds((prev) => prev.filter((id) => !filteredIds.includes(id)))
    } else {
      setSelectedIds((prev) => {
        const next = [...prev]
        filteredIds.forEach((id) => {
          if (!next.includes(id)) {
            next.push(id)
          }
        })
        return next
      })
    }
  }

  // Xóa các mục đã chọn
  const handleBatchDelete = async () => {
    if (activeSelectedIds.length === 0) return
    if (
      !window.confirm(`Bạn có chắc chắn muốn xóa ${activeSelectedIds.length} mục đã chọn?`)
    ) {
      return
    }
    await deleteMultiple(activeSelectedIds)
    setSelectedIds([])
  }

  // Điều hướng về trang search kèm query cũ
  const handleReSearch = (item: HistoryItem) => {
    navigate('/search', {
      state: {
        // queryType: item.query_type,
        // queryValue: item.query_value,
        // autoSubmit: true,
        queryType: 'ocr',
        queryValue: 'hello',
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
      </div>

      {/* Lỗi nếu xảy ra */}
      {error && (
        <div className="flex items-start gap-2 p-4 border border-red-100 bg-red-50 text-red-700 text-sm rounded-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Bộ lọc loại tìm kiếm */}
      <HistoryFilters activeFilter={activeFilter} onChange={(f) => {
        setActiveFilter(f)
      }} />

      {/* Batch Action Bar (Chỉ hiển thị khi có ít nhất 1 mục được chọn) */}
      {activeSelectedIds.length > 0 && (
        <div className="flex items-center justify-between border border-accent-100 bg-accent-50/50 px-4 py-3 rounded-sm animate-in fade-in duration-200">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={isAllFilteredSelected}
              onChange={handleToggleSelectAll}
              className="h-4 w-4 rounded-sm border-border text-accent-600 focus:ring-accent-600 accent-accent-600 cursor-pointer"
              id="select-all-checkbox"
            />
            <label
              htmlFor="select-all-checkbox"
              className="text-xs font-semibold text-accent-700 cursor-pointer select-none"
            >
              Chọn tất cả
            </label>
            <span className="text-xs text-accent-600 font-medium ml-2">
              (Đã chọn {activeSelectedIds.length} mục)
            </span>
          </div>
          <button
            type="button"
            onClick={handleBatchDelete}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 active:bg-red-800 transition-all duration-150 rounded-sm cursor-pointer shadow-sm"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Xóa các mục đã chọn</span>
          </button>
        </div>
      )}

      {/* Danh sách lịch sử hiển thị */}
      <HistoryList
        items={filteredItems}
        isLoading={isLoading}
        deletingIds={deletingIds}
        onDelete={deleteItem}
        onReSearch={handleReSearch}
        selectedIds={activeSelectedIds}
        onToggleSelect={handleToggleSelect}
      />
    </PageContainer>
  )
}
