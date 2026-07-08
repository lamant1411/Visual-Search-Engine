import { Clock } from 'lucide-react'
import { HistoryItem } from './HistoryItem'
import { Skeleton } from '@/components/base/loader'
import type { HistoryItem as HistoryItemType } from '@/lib/api/history'

interface HistoryListProps {
  items: HistoryItemType[]
  isLoading: boolean
  deletingIds: number[]
  onDelete: (id: number) => Promise<void>
  onReSearch: (item: HistoryItemType) => void
}

export function HistoryList({
  items,
  isLoading,
  deletingIds,
  onDelete,
  onReSearch,
}: HistoryListProps) {
  // Skeleton hiển thị khi đang load
  if (isLoading) {
    return (
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex items-center justify-between border border-border bg-surface-2 p-4 rounded-sm"
          >
            <div className="flex items-center gap-4 flex-1">
              <Skeleton width={48} height={48} rounded={false} />
              <div className="flex-1">
                <div className="flex gap-2 mb-2">
                  <Skeleton width={80} height={18} rounded={false} />
                  <Skeleton width={120} height={14} rounded={false} />
                </div>
                <Skeleton width="60%" height={16} rounded={false} />
              </div>
            </div>
            <div className="flex items-center gap-2 ml-4">
              <Skeleton width={32} height={32} rounded={false} />
              <Skeleton width={32} height={32} rounded={false} />
            </div>
          </div>
        ))}
      </div>
    )
  }

  // Trạng thái trống
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center border border-border border-dashed bg-surface-2 py-16 px-4 text-center rounded-sm">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-50 text-ink-muted mb-4 border border-border">
          <Clock className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-semibold text-ink-primary mb-1">Chưa có lịch sử tìm kiếm</h3>
        <p className="text-xs text-ink-secondary max-w-[320px]">
          Các lượt tìm kiếm bằng hình ảnh hoặc từ khóa của bạn sẽ được lưu giữ tự động tại đây.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {items.map((item) => (
        <HistoryItem
          key={item.id}
          item={item}
          onDelete={onDelete}
          onReSearch={onReSearch}
          isDeleting={deletingIds.includes(item.id)}
        />
      ))}
    </div>
  )
}
