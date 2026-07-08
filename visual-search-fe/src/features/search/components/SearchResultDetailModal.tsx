import { type MouseEvent, useEffect, useState } from 'react'
import { Check, Copy, Info, Maximize2, Minus, Plus, RotateCcw, Search, X, Zap } from 'lucide-react'

import { Button } from '@/components/base/button'

import type { SearchResult } from '../types'

type SearchResultDetailModalProps = {
  result: SearchResult
  onClose: () => void
  onFindSimilar?: (result: SearchResult) => void
}

export function SearchResultDetailModal({ result, onClose, onFindSimilar }: SearchResultDetailModalProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const [zoom, setZoom] = useState(1)
  const [zoomOrigin, setZoomOrigin] = useState('50% 50%')
  const isZoomed = zoom > 1
  const sizeLabel =
    result.metadata.width && result.metadata.height
      ? `${result.metadata.width} x ${result.metadata.height}`
      : 'Unknown size'

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      onClick={onClose}
    >
      <section
        className="grid h-[92vh] w-[96vw] max-w-[1500px] overflow-hidden rounded-xl bg-white shadow-2xl lg:grid-cols-[minmax(0,1fr)_320px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={[
            'relative flex min-h-[420px] items-center justify-center overflow-hidden bg-slate-950 lg:min-h-0',
            isZoomed ? 'cursor-zoom-out' : 'cursor-zoom-in',
          ].join(' ')}
          onClick={handleImageClick}
          onMouseMove={handleImageMouseMove}
        >
          <div
            className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-black/55 p-1 text-white backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Zoom out"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={zoom <= 1}
              type="button"
              onClick={() => setZoom((currentZoom) => Math.max(1, currentZoom - 0.25))}
            >
              <Minus className="h-4 w-4" />
            </button>

            <button
              aria-label="Reset zoom"
              className="inline-flex h-8 items-center justify-center gap-1 rounded-full px-2 text-xs font-semibold hover:bg-white/15"
              type="button"
              onClick={resetZoom}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {Math.round(zoom * 100)}%
            </button>

            <button
              aria-label="Zoom in"
              className="inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={zoom >= 2.5}
              type="button"
              onClick={() => setZoom((currentZoom) => Math.min(2.5, currentZoom + 0.25))}
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <img
            alt={`Search result ${result.id}`}
            className="h-full max-h-[92vh] w-full object-contain transition-transform duration-200"
            draggable={false}
            src={result.imageUrl}
            style={{ transform: `scale(${zoom})`, transformOrigin: zoomOrigin }}
          />
        </div>

        <aside className="flex max-h-[92vh] flex-col overflow-y-auto p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-accent-600">Image detail</p>
              <h2 className="mt-1 text-xl font-bold text-ink-primary">Image #{result.id}</h2>
            </div>

            <Button
              aria-label="Close image detail"
              size="icon"
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          <div className="mt-5 rounded-xl border border-border bg-surface-0 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-accent-600">
              <Zap className="h-4 w-4" />
              {Math.round(result.similarityScore)}% similarity
            </div>
          </div>

          <dl className="mt-5 space-y-4 text-sm">
            <DetailRow label="Size" value={sizeLabel} />
            <DetailRow label="Source" value={result.metadata.source ?? 'Unknown'} />
            <DetailRow label="Image ID" value={String(result.id)} />
          </dl>

          {result.metadata.ocrText && (
            <div className="mt-5 rounded-xl border border-border bg-white p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
                <Info className="h-4 w-4 text-accent-600" />
                OCR text
              </div>
              <p className="mt-2 text-sm text-ink-secondary">{result.metadata.ocrText}</p>
            </div>
          )}

          <div className="mt-auto space-y-3 pt-6">
            <Button
              fullWidth
              className="bg-slate-950 hover:bg-slate-800 active:bg-slate-900"
              leftIcon={<Search className="h-4 w-4" />}
              type="button"
              onClick={() => onFindSimilar?.(result)}
            >
              Find similar images
            </Button>

            <Button
              fullWidth
              leftIcon={
                copyStatus === 'copied' ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />
              }
              type="button"
              variant="secondary"
              onClick={handleCopyImageUrl}
            >
              {copyStatus === 'copied' ? 'Copied URL' : 'Copy image URL'}
            </Button>

            {copyStatus === 'error' && (
              <p className="text-center text-xs font-medium text-red-600">Could not copy this URL.</p>
            )}
          </div>
        </aside>
      </section>
    </div>
  )

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
      await navigator.clipboard.writeText(result.imageUrl)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-ink-muted">{label}</dt>
      <dd className="mt-1 flex items-center gap-2 font-medium text-ink-primary">
        <Maximize2 className="h-3.5 w-3.5 text-ink-muted" />
        {value}
      </dd>
    </div>
  )
}
