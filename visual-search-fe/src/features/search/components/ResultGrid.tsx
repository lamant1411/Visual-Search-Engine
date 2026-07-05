import type { SearchResult } from '../types'

type ResultGridProps = {
  results: SearchResult[]
  hasSearched: boolean
}

export function ResultGrid({ results, hasSearched }: ResultGridProps) {
  if (!hasSearched) {
    return (
      <section className="rounded-xl border border-dashed border-border bg-white p-8 text-center">
        <p className="text-base font-semibold text-ink-primary">Initial state</p>
        <p className="mt-2 text-sm text-ink-secondary">No search has been submitted yet.</p>
      </section>
    )
  }

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-xl font-bold text-ink-primary">Mock results</h2>
        <p className="mt-1 text-sm text-ink-secondary">Simple result layout for Day 1. Masonry and pagination come later.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {results.map((result) => (
          <article key={result.id} className="rounded-xl border border-border bg-white p-4 shadow-sm">
            <img
              alt={`Mock result ${result.id}`}
              className="h-40 w-full rounded-lg object-cover"
              src={result.thumbnailUrl}
            />
            <div className="mt-3">
              <h3 className="font-semibold text-ink-primary">Image #{result.id}</h3>
              <p className="mt-1 text-sm text-ink-secondary">Similarity: {Math.round(result.similarityScore)}%</p>
            </div>
          </article>
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
