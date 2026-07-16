import type { SearchResult } from '../types'
import { ResultCard } from './ResultCard'

type ResultGridProps = {
  results: SearchResult[]
  isBookmarked?: (imageId: number) => boolean
  onBookmark?: (result: SearchResult) => void
  onSelectResult?: (result: SearchResult) => void
}

export function ResultGrid({ results, isBookmarked, onBookmark, onSelectResult }: ResultGridProps) {
  return (
    <section>
      <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
        {results.map((result) => (
          <ResultCard
            key={result.id}
            result={result}
            isBookmarked={isBookmarked?.(result.id)}
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
