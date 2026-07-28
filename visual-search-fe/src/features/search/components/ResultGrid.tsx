import type { SearchResult } from '../types'
import { ResultCard } from './ResultCard'
import { Skeleton } from '@/components/base/loader'

type ResultGridProps = {
  results: SearchResult[]
  isBookmarked?: (imageId: number) => boolean
  showSimilarity?: boolean
  onBookmark?: (result: SearchResult) => void
  onSelectResult?: (result: SearchResult) => void
}

export function ResultGrid({
  results,
  isBookmarked,
  showSimilarity = true,
  onBookmark,
  onSelectResult,
}: ResultGridProps) {
  return (
    <section>
      <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
        {results.map((result, index) => (
          <ResultCard
            key={result.id}
            result={result}
            priority={index < 4}
            isBookmarked={isBookmarked?.(result.id)}
            showSimilarity={showSimilarity}
            onBookmark={onBookmark}
            onSelect={onSelectResult}
          />
        ))}
      </div>

      {results.length === 0 && (
        <div className="rounded-xl border border-border bg-white p-6 text-center">
          <p className="text-sm text-ink-secondary">No results available.</p>
        </div>
      )}
    </section>
  )
}

export function ResultGridSkeleton({ limit }: { limit: number }) {
  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4" role="status">
      <span className="sr-only">Loading images...</span>
      {Array.from({ length: limit }).map((_, index) => (
        <div
          key={index}
          className="mb-5 break-inside-avoid rounded-lg bg-white p-2 shadow-sm"
        >
          <Skeleton
            height={index % 3 === 0 ? 260 : index % 2 === 0 ? 320 : 190}
            className="overflow-hidden rounded-md"
          />
          <Skeleton lines={1} className="mt-3" />
        </div>
      ))}
    </div>
  )
}
