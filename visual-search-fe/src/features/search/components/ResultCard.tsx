import { useState } from 'react'
import { Info, Zap } from 'lucide-react'

import type { SearchResult } from '../types'
import { formatSimilarityScore } from '../utils/formatSimilarityScore'

type ResultCardProps = {
  result: SearchResult
  onSelect?: (result: SearchResult) => void
}

export function ResultCard({ result, onSelect }: ResultCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false)
  const sizeLabel =
    result.metadata.width && result.metadata.height
      ? `${result.metadata.width} x ${result.metadata.height}`
      : 'Unknown size'
  const aspectRatio =
    result.metadata.width && result.metadata.height
      ? `${result.metadata.width} / ${result.metadata.height}`
      : '4 / 3'
  const similarityScore = formatSimilarityScore(result.similarityScore)

  return (
    <button
      type="button"
      className="group mb-5 block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-lg bg-white text-left shadow-sm shadow-slate-200/70 ring-1 ring-white/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/90 active:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
      aria-label={`Open detail for image ${result.id}`}
      onClick={() => onSelect?.(result)}
    >
      <div className="relative overflow-hidden bg-surface-1" style={{ aspectRatio }}>
        {!imageLoaded && <div className="absolute inset-0 animate-pulse bg-slate-200" />}
        <img
          alt={`Search result ${result.id}`}
          className={[
            'h-full w-full object-cover transition duration-300 group-hover:scale-105',
            imageLoaded ? 'opacity-100' : 'opacity-0',
          ].join(' ')}
          loading="lazy"
          src={result.thumbnailUrl}
          onLoad={() => setImageLoaded(true)}
        />
        <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-ink-primary shadow-sm shadow-slate-900/10 backdrop-blur">
          <Zap className="h-3.5 w-3.5 text-accent-600" />
          {similarityScore}%
        </span>

        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-4 pt-14 text-white opacity-0 transition duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
          <h2 className="text-sm font-semibold">{result.metadata.source ?? 'Image result'}</h2>
          <p className="mt-1 text-xs text-white/80">
            {sizeLabel}
            {` · #${result.id}`}
          </p>

          {result.metadata.ocrText && (
            <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-md bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800">
              <Info className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">OCR: {result.metadata.ocrText}</span>
            </p>
          )}
        </div>
      </div>
    </button>
  )
}
