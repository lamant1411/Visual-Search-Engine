import type { SearchResult } from '../types'
import { ResultCard } from './ResultCard'

type ResultGridProps = {
  results: SearchResult[]
}

export function ResultGrid({ results }: ResultGridProps) {
  return (
    <section>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {results.map((result) => (
          <ResultCard key={result.id} result={result} />
        ))}
      </div>

      {results.length === 0 && (
        <div className="rounded-xl border border-border bg-white p-6 text-center">
          <p className="text-sm text-ink-secondary">No mock results available.</p>
        </div>
      )}
    </section>
  )
}
