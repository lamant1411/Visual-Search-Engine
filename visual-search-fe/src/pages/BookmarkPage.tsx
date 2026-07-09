import { AlertCircle, Bookmark, BookmarkX, Loader2 } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { useBookmark } from '@/features/bookmark/useBookmark'
import type { BookmarkItem } from '@/lib/api/bookmark'

// ── Skeleton một card ─────────────────────────────────────────────

function SkeletonCard({ height }: { height: number }) {
  return (
    <div
      className="w-full rounded-xl bg-surface-1 animate-pulse"
      style={{ height }}
    />
  )
}

// ── Skeleton grid khi đang load ───────────────────────────────────

const SKELETON_HEIGHTS = [220, 160, 280, 200, 240, 180, 300, 160, 220, 260, 180, 200]

function SkeletonGrid() {
  return (
    <div className="columns-2 sm:columns-3 lg:columns-4 gap-3">
      {SKELETON_HEIGHTS.map((h, i) => (
        <div key={i} className="mb-3 break-inside-avoid">
          <SkeletonCard height={h} />
        </div>
      ))}
    </div>
  )
}

// ── Card một ảnh đã bookmark ──────────────────────────────────────

interface BookmarkCardProps {
  item: BookmarkItem
  isRemoving: boolean
  onRemove: (id: number) => void
}

function BookmarkCard({ item, isRemoving, onRemove }: BookmarkCardProps) {
  return (
    <div className="group relative break-inside-avoid mb-3">
      {/* Ảnh */}
      <div className="relative overflow-hidden rounded-xl bg-surface-1">
        <img
          src={item.image_url}
          alt={item.title}
          loading="lazy"
          className="w-full h-auto block object-cover transition-transform duration-300 group-hover:scale-[1.03]"
        />

        {/* Overlay xuất hiện khi hover */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-250 rounded-xl" />

        {/* Nút xoá bookmark */}
        <button
          type="button"
          aria-label="Xoá khỏi bookmark"
          disabled={isRemoving}
          onClick={() => onRemove(item.id)}
          className="absolute top-2 right-2 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-white/90 hover:bg-white text-ink-secondary hover:text-red-500 shadow-sm transition-all duration-200 opacity-0 group-hover:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
        >
          {isRemoving ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <BookmarkX className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Title ở dưới, chỉ hiện khi hover */}
        <div className="absolute bottom-0 left-0 right-0 px-3 py-2.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
          <p className="text-white text-xs font-medium line-clamp-2 leading-snug drop-shadow">
            {item.title}
          </p>
        </div>
      </div>
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center gap-4">
      <div className="w-16 h-16 rounded-full bg-surface-1 flex items-center justify-center">
        <Bookmark className="w-7 h-7 text-ink-muted" />
      </div>
      <div>
        <p className="text-sm font-semibold text-ink-primary">Chưa có ảnh nào được lưu</p>
        <p className="text-xs text-ink-muted mt-1">
          Hãy lưu những hình ảnh bạn yêu thích từ kết quả tìm kiếm.
        </p>
      </div>
    </div>
  )
}

// ── Masonry Grid ──────────────────────────────────────────────────

interface MasonryGridProps {
  items: BookmarkItem[]
  removingIds: number[]
  onRemove: (id: number) => void
}

function MasonryGrid({ items, removingIds, onRemove }: MasonryGridProps) {
  if (items.length === 0) return <EmptyState />

  return (
    <div className="columns-2 sm:columns-3 lg:columns-4 gap-3">
      {items.map((item) => (
        <BookmarkCard
          key={item.id}
          item={item}
          isRemoving={removingIds.includes(item.id)}
          onRemove={onRemove}
        />
      ))}
    </div>
  )
}

// ── BookmarkPage ──────────────────────────────────────────────────

export default function BookmarkPage() {
  const { items, isLoading, error, removingIds, removeItem } = useBookmark()

  return (
    <PageContainer size="wide" className="py-8 space-y-6">
      {/* Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold text-ink-primary tracking-tight">
            Ảnh đã lưu
          </h1>
          {!isLoading && items.length > 0 && (
            <span className="text-sm text-ink-muted font-medium">
              {items.length} ảnh
            </span>
          )}
        </div>
        <p className="text-sm text-ink-secondary mt-1">
          Những hình ảnh bạn đã đánh dấu từ kết quả tìm kiếm.
        </p>
      </div>

      {/* Lỗi */}
      {error && (
        <div className="flex items-start gap-2 p-4 border border-red-100 bg-red-50 text-red-700 text-sm rounded-sm">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* Nội dung */}
      {isLoading ? (
        <SkeletonGrid />
      ) : (
        <MasonryGrid items={items} removingIds={removingIds} onRemove={removeItem} />
      )}
    </PageContainer>
  )
}
