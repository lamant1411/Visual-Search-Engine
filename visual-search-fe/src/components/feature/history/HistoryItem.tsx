import { Image, Sparkles, ScanText, Search, Trash2 } from 'lucide-react'
import type { HistoryItem as HistoryItemType } from '@/lib/api/history'

interface HistoryItemProps {
  item: HistoryItemType
  onDelete: (id: number) => Promise<void>
  onReSearch: (item: HistoryItemType) => void
  isDeleting?: boolean
}

export function HistoryItem({ item, onDelete, onReSearch, isDeleting = false }: HistoryItemProps) {
  // Format thời gian hiển thị gọn gàng
  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString)
      return date.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      })
    } catch {
      return isoString
    }
  }

  // Render badge và icon tương ứng với query_type
  const renderTypeBadge = () => {
    switch (item.query_type) {
      case 'image':
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-sm">
            <Image className="h-3.5 w-3.5" />
            <span>Hình ảnh</span>
          </div>
        )
      case 'semantic':
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-accent-600 bg-accent-50 px-2 py-0.5 rounded-sm">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Nội dung ảnh</span>
          </div>
        )
      case 'ocr':
        return (
          <div className="flex items-center gap-1.5 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-0.5 rounded-sm">
            <ScanText className="h-3.5 w-3.5" />
            <span>Chữ trong ảnh</span>
          </div>
        )
      default:
        return null
    }
  }

  return (
    <div
      className={`group flex items-center justify-between border border-border bg-surface-2 p-4 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-sm rounded-sm ${isDeleting ? 'opacity-50 pointer-events-none' : ''
        }`}
    >
      <div className="flex items-center gap-4 min-w-0 flex-1">
        {/* Hình ảnh đại diện / Icon minh họa */}
        <div className="flex h-12 w-12 shrink-0 items-center justify-center border border-border bg-surface-1 overflow-hidden rounded-sm">
          {item.query_type === 'image' ? (
            <img
              src={item.query_value}
              alt="Query thumbnail"
              className="h-full w-full object-cover"
              loading="lazy"
              onError={(e) => {
                // Fallback nếu ảnh lỗi
                e.currentTarget.style.display = 'none'
                const parent = e.currentTarget.parentElement
                if (parent) {
                  const fallbackIcon = document.createElement('div')
                  fallbackIcon.className = 'text-ink-muted'
                  fallbackIcon.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-image"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`
                  parent.appendChild(fallbackIcon)
                }
              }}
            />
          ) : item.query_type === 'semantic' ? (
            <Sparkles className="h-5 w-5 text-accent-600" />
          ) : (
            <ScanText className="h-5 w-5 text-amber-600" />
          )}
        </div>

        {/* Nội dung text */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 mb-1">
            {renderTypeBadge()}
            <span className="text-[11px] text-ink-muted">{formatTime(item.created_at)}</span>
          </div>
          <p className="text-sm font-medium text-ink-primary truncate">
            {item.query_type === 'image' ? 'Tìm kiếm bằng hình ảnh tải lên' : item.query_value}
          </p>
        </div>
      </div>

      {/* Cụm Action Buttons */}
      <div className="flex items-center gap-2 ml-4">
        <button
          type="button"
          onClick={() => onReSearch(item)}
          className="flex h-8 w-8 items-center justify-center border border-border bg-surface-2 text-ink-secondary hover:text-accent-600 hover:border-accent-100 hover:bg-accent-50/50 transition-all duration-150 active:scale-95 rounded-sm"
          title="Tìm kiếm lại với cấu hình này"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(item.id)}
          className="flex h-8 w-8 items-center justify-center border border-border bg-surface-2 text-ink-secondary hover:text-red-600 hover:border-red-100 hover:bg-red-50/50 transition-all duration-150 active:scale-95 rounded-sm"
          title="Xóa mục lịch sử này"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
