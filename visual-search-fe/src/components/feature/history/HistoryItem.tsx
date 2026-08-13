import { useState } from 'react'
import { FileText, Image, RotateCcw, ZoomIn } from 'lucide-react'
import type { HistoryItem as HistoryItemType, SearchQueryType } from '@/lib/api/history'

interface HistoryItemProps {
  item: HistoryItemType
  onReSearch: (item: HistoryItemType) => void
  onPreviewImage?: (item: HistoryItemType) => void
}

const typeConfig: Record<
  SearchQueryType,
  { label: string; icon: typeof Image; iconClass: string; surfaceClass: string }
> = {
  image: {
    label: 'Image',
    icon: Image,
    iconClass: 'text-sky-700',
    surfaceClass: 'border-sky-100 bg-sky-50',
  },
  semantic: {
    label: 'Text',
    icon: FileText,
    iconClass: 'text-accent-700',
    surfaceClass: 'border-accent-100 bg-accent-50',
  },
  ocr: {
    label: 'Text',
    icon: FileText,
    iconClass: 'text-accent-700',
    surfaceClass: 'border-accent-100 bg-accent-50',
  },
  hybrid: {
    label: 'Text',
    icon: FileText,
    iconClass: 'text-accent-700',
    surfaceClass: 'border-accent-100 bg-accent-50',
  },
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function getImagePreview(item: HistoryItemType) {
  if (item.query_image_url) return item.query_image_url
  if (item.query_value.startsWith('http://') || item.query_value.startsWith('https://')) {
    return item.query_value
  }
  return null
}

export function HistoryItem({
  item,
  onReSearch,
  onPreviewImage,
}: HistoryItemProps) {
  const config = typeConfig[item.query_type]
  const Icon = config.icon
  const previewUrl = item.query_type === 'image' ? getImagePreview(item) : null
  const [previewFailed, setPreviewFailed] = useState(false)
  const showPreview = Boolean(previewUrl && !previewFailed)

  return (
    <li
      onClick={() => onReSearch(item)}
      className="group flex cursor-pointer flex-col gap-3 px-4 py-4 transition-colors duration-150 hover:bg-surface-1/70 sm:flex-row sm:items-center sm:gap-5 sm:px-5"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3.5">
        <div
          onClick={(e) => {
            if (showPreview && onPreviewImage) {
              e.stopPropagation()
              onPreviewImage(item)
            }
          }}
          className={`group/thumb relative flex h-16 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border ${
            config.surfaceClass
          } ${showPreview ? 'cursor-zoom-in' : ''}`}
          title={showPreview ? 'Click to enlarge image' : undefined}
        >
          {showPreview ? (
            <>
              <img
                src={previewUrl ?? undefined}
                alt={`Reference image for ${item.query_value}`}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-200 group-hover/thumb:scale-105 motion-reduce:transform-none"
                onError={() => setPreviewFailed(true)}
              />
              <div className="absolute inset-0 flex items-center justify-center bg-black/35 opacity-100 transition-opacity duration-150 sm:opacity-0 sm:group-hover/thumb:opacity-100">
                <ZoomIn className="h-5 w-5 text-white drop-shadow-sm" />
              </div>
            </>
          ) : (
            <Icon className={`h-5 w-5 ${config.iconClass}`} aria-hidden="true" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-ink-secondary">
              <Icon className={`h-3.5 w-3.5 ${config.iconClass}`} aria-hidden="true" />
              {config.label}
            </span>
            <span className="text-ink-muted" aria-hidden="true">·</span>
            <time dateTime={item.created_at} className="font-medium text-ink-muted">
              {formatDate(item.created_at)}
            </time>
          </div>
          <p className="mt-1.5 truncate text-sm font-semibold leading-5 text-ink-primary" title={item.query_value}>
            {item.query_value}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-end sm:pl-0">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onReSearch(item)
          }}
          className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-md border border-border bg-white px-3 text-xs font-semibold text-ink-secondary shadow-sm shadow-slate-200/40 transition-colors hover:border-accent-100 hover:bg-accent-50 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500 focus-visible:ring-offset-2 sm:h-10 sm:min-h-0"
          title="Search again"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          Search again
        </button>
      </div>
    </li>
  )
}
