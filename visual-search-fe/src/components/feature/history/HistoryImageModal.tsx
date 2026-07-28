import { type MouseEvent, useEffect, useState } from 'react'
import {
  Check,
  Copy,
  FileText,
  Image as ImageIcon,
  Minus,
  Plus,
  RotateCcw,
  ScanText,
  X,
} from 'lucide-react'
import { Button } from '@/components/base/button'
import type { HistoryItem, SearchQueryType } from '@/lib/api/history'

type HistoryImageModalProps = {
  item: HistoryItem
  onClose: () => void
  onReSearch: (item: HistoryItem) => void
}

const typeConfig: Record<
  SearchQueryType,
  { label: string; icon: typeof ImageIcon; iconClass: string }
> = {
  image: { label: 'Image Search', icon: ImageIcon, iconClass: 'text-sky-700' },
  semantic: { label: 'Semantic Search', icon: FileText, iconClass: 'text-accent-700' },
  ocr: { label: 'OCR Search', icon: ScanText, iconClass: 'text-amber-700' },
}

function formatDate(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

export function HistoryImageModal({ item, onClose, onReSearch }: HistoryImageModalProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [imageLoaded, setImageLoaded] = useState(false)
  const [zoom, setZoom] = useState(1)
  const [zoomOrigin, setZoomOrigin] = useState('50% 50%')

  const imageUrl = item.query_image_url || item.query_value
  const config = typeConfig[item.query_type]
  const Icon = config.icon
  const isZoomed = zoom > 1

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  function handleImageClick(event: MouseEvent<HTMLDivElement>) {
    updateZoomOrigin(event)
    setZoom((currentZoom) => (currentZoom > 1 ? 1 : 2))
  }

  function handleImageMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (isZoomed) {
      updateZoomOrigin(event)
    }
  }

  function resetZoom() {
    setZoom(1)
    setZoomOrigin('50% 50%')
  }

  function updateZoomOrigin(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect()
    const x = clamp(((event.clientX - bounds.left) / bounds.width) * 100, 0, 100)
    const y = clamp(((event.clientY - bounds.top) / bounds.height) * 100, 0, 100)

    setZoomOrigin(`${x}% ${y}%`)
  }

  async function handleCopyImageUrl() {
    try {
      await navigator.clipboard.writeText(imageUrl)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      onClick={onClose}
    >
      <section
        className="flex max-h-[96vh] w-[96vw] max-w-[1300px] flex-col overflow-y-auto rounded-lg bg-white shadow-2xl lg:grid lg:h-[88vh] lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={[
            'relative flex h-[50vh] min-h-[300px] shrink-0 items-center justify-center overflow-hidden bg-slate-950 sm:min-h-[400px] lg:h-auto lg:min-h-0',
            isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in',
          ].join(' ')}
          onClick={handleImageClick}
          onMouseMove={handleImageMouseMove}
        >
          <div
            className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-black/60 p-1 text-white shadow-sm backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Zoom out"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={zoom <= 1}
              type="button"
              onClick={() => setZoom((currentZoom) => Math.max(1, currentZoom - 0.25))}
            >
              <Minus className="h-4 w-4" />
            </button>

            <button
              aria-label="Reset zoom"
              className="inline-flex h-9 cursor-pointer items-center justify-center gap-1 rounded-full px-3 text-xs font-bold transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              type="button"
              onClick={resetZoom}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {Math.round(zoom * 100)}%
            </button>

            <button
              aria-label="Zoom in"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={zoom >= 2.5}
              type="button"
              onClick={() => setZoom((currentZoom) => Math.min(2.5, currentZoom + 0.25))}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {!imageLoaded && <div className="absolute inset-0 animate-pulse bg-slate-900" />}

          <img
            alt={item.query_value}
            className={[
              'h-full w-full object-contain transition duration-200',
              imageLoaded ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
            decoding="async"
            draggable={false}
            src={imageUrl}
            style={{ transform: `scale(${zoom})`, transformOrigin: zoomOrigin }}
            onLoad={() => setImageLoaded(true)}
          />
        </div>

        <aside className="flex flex-col bg-white p-5 lg:max-h-[88vh] lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-accent-600">History preview</p>
              <h2 className="font-display mt-1 text-xl font-bold text-ink-primary">
                Searched Image
              </h2>
            </div>

            <Button
              aria-label="Close image detail"
              className="focus-visible:ring-accent-600"
              size="icon"
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <dl className="mt-5 space-y-4 text-sm">
            <div className="rounded-lg border border-border bg-white px-4 py-3 shadow-sm shadow-slate-200/60">
              <dt className="text-xs font-semibold uppercase text-ink-muted">Query Type</dt>
              <dd className="mt-1 flex items-center gap-2 font-semibold text-ink-primary">
                <Icon className={`h-4 w-4 ${config.iconClass}`} />
                {config.label}
              </dd>
            </div>

            <div className="rounded-lg border border-border bg-white px-4 py-3 shadow-sm shadow-slate-200/60">
              <dt className="text-xs font-semibold uppercase text-ink-muted">Query Value</dt>
              <dd className="mt-1 break-all font-mono text-xs font-semibold text-ink-primary">
                {item.query_value}
              </dd>
            </div>

            <div className="rounded-lg border border-border bg-white px-4 py-3 shadow-sm shadow-slate-200/60">
              <dt className="text-xs font-semibold uppercase text-ink-muted">Search Date</dt>
              <dd className="mt-1 font-semibold text-ink-primary">{formatDate(item.created_at)}</dd>
            </div>
          </dl>

          <div className="mt-auto space-y-3 pt-6">
            <Button
              fullWidth
              className="!bg-ink-primary shadow-sm shadow-slate-300/70 hover:!bg-slate-800 active:!bg-slate-900 focus-visible:ring-accent-600"
              leftIcon={<RotateCcw className="h-4 w-4" />}
              type="button"
              onClick={() => {
                onClose()
                onReSearch(item)
              }}
            >
              Search again with this image
            </Button>

            <Button
              fullWidth
              className="focus-visible:ring-accent-600"
              leftIcon={
                copyStatus === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />
              }
              type="button"
              variant="secondary"
              onClick={handleCopyImageUrl}
            >
              {copyStatus === 'copied' ? 'URL copied' : 'Copy image URL'}
            </Button>
          </div>
        </aside>
      </section>
    </div>
  )
}
