import type { SearchResult } from '../types'
import { ResultCard } from './ResultCard'

type ResultGridProps = {
  results: SearchResult[]
  onSelectResult?: (result: SearchResult) => void
}

export function ResultGrid({ results, onSelectResult }: ResultGridProps) {
  return (
    <section>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {results.map((result) => (
          <ResultCard key={result.id} result={result} onSelect={onSelectResult} />
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
