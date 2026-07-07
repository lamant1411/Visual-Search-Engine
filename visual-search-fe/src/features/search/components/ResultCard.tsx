import { Info, Zap } from 'lucide-react'

import type { SearchResult } from '../types'

type ResultCardProps = {
  result: SearchResult
}

export function ResultCard({ result }: ResultCardProps) {
  return (
    <article className="group overflow-hidden rounded-xl border border-border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
      <div className="relative aspect-[4/3] overflow-hidden bg-surface-1">
        <img
          alt={`Search result ${result.id}`}
          className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
          loading="lazy"
          src={result.thumbnailUrl}
        />
        <span className="absolute bottom-3 right-3 inline-flex items-center gap-1 rounded-full bg-white/90 px-3 py-1 text-xs font-bold text-accent-600 shadow-sm">
          <Zap className="h-3.5 w-3.5" />
          {Math.round(result.similarityScore)}%
        </span>
      </div>

      <div className="space-y-3 p-4">
        <div>
          <h2 className="text-sm font-semibold text-ink-primary">Image #{result.id}</h2>
          <p className="mt-1 text-xs text-ink-secondary">
            {result.metadata.width} x {result.metadata.height}
            {result.metadata.source ? ` · ${result.metadata.source}` : ''}
          </p>
        </div>

        {result.metadata.ocrText && (
          <p className="inline-flex items-center gap-2 rounded-lg bg-surface-1 px-3 py-2 text-xs font-medium text-ink-secondary">
            <Info className="h-3.5 w-3.5" />
            OCR: {result.metadata.ocrText}
          </p>
        )}
      </div>
    </article>
  )
}
