import { useEffect, useState } from 'react'
import { Check, Copy, ExternalLink, Info, Maximize2, X, Zap } from 'lucide-react'

import { Button } from '@/components/base/button'

import type { SearchResult } from '../types'

type SearchResultDetailModalProps = {
  result: SearchResult
  onClose: () => void
}

export function SearchResultDetailModal({ result, onClose }: SearchResultDetailModalProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
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
        className="grid max-h-[90vh] w-full max-w-5xl overflow-hidden rounded-xl bg-white shadow-2xl lg:grid-cols-[minmax(0,1.35fr)_340px]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex min-h-[320px] items-center justify-center bg-slate-950">
          <img
            alt={`Search result ${result.id}`}
            className="max-h-[70vh] w-full object-contain"
            src={result.imageUrl}
          />
        </div>

        <aside className="flex max-h-[90vh] flex-col overflow-y-auto p-5">
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

            <a
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border border-slate-300 bg-transparent px-4 py-2 text-sm font-semibold text-slate-700 transition-all duration-200 hover:bg-slate-50 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              href={result.imageUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink className="h-4 w-4" />
              <span>Open original</span>
            </a>
          </div>
        </aside>
      </section>
    </div>
  )

  async function handleCopyImageUrl() {
    try {
      await navigator.clipboard.writeText(result.imageUrl)
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }
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
