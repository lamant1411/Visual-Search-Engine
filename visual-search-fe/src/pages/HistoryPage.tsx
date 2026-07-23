import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertCircle, History, RefreshCw } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { HistoryFilters } from '@/components/feature/history/HistoryFilters'
import { HistoryList } from '@/components/feature/history/HistoryList'
import { useHistory } from '@/features/history/useHistory'
import type { HistoryItem, SearchQueryType } from '@/lib/api/history'

type FilterType = 'all' | SearchQueryType

export default function HistoryPage() {
  const navigate = useNavigate()
  const {
    items,
    total,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useHistory()
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')

  const filteredItems = useMemo(
    () => items.filter((item) => activeFilter === 'all' || item.query_type === activeFilter),
    [activeFilter, items],
  )
  const counts = useMemo(
    () => ({
      all: items.length,
      image: items.filter((item) => item.query_type === 'image').length,
      semantic: items.filter((item) => item.query_type === 'semantic').length,
      ocr: items.filter((item) => item.query_type === 'ocr').length,
    }),
    [items],
  )
  function handleReSearch(item: HistoryItem) {
    if (item.query_type === 'image') {
      const imgTarget = item.query_image_url || item.query_value
      const imageIdNum = Number.isInteger(Number(imgTarget)) && Number(imgTarget) > 0 ? Number(imgTarget) : undefined

      if (imageIdNum) {
        navigate(`/search/results?mode=image&imageId=${imageIdNum}`)
      } else if (imgTarget) {
        navigate(
          `/search/results?mode=image&imageUrl=${encodeURIComponent(imgTarget)}&q=${encodeURIComponent(item.query_value)}`,
        )
      } else {
        navigate('/search', { state: { mode: 'image' } })
      }
      return
    }

    navigate(
      `/search/results?mode=${item.query_type}&q=${encodeURIComponent(item.query_value)}&page=1&limit=20`,
    )
  }

  return (
    <PageContainer size="wide" className="max-w-6xl space-y-6 pb-12 pt-8">
      <header className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border bg-white text-ink-primary shadow-sm shadow-slate-200/60">
            <History className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-ink-primary">Search history</h1>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-ink-secondary">
              Review previous searches and run them again without rebuilding the query.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void refetch()}
          disabled={isFetching}
          className="inline-flex h-9 items-center gap-2 self-start rounded-lg border border-border bg-white px-3 text-xs font-semibold text-ink-secondary shadow-sm shadow-slate-200/50 transition-colors hover:bg-surface-1 hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-50 sm:self-auto"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </header>

      {error && (
        <div role="alert" className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <div className="flex min-w-0 items-start gap-2">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void refetch()}
            className="shrink-0 text-xs font-bold underline underline-offset-2"
          >
            Try again
          </button>
        </div>
      )}

      <section aria-label="History controls" className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <HistoryFilters activeFilter={activeFilter} counts={counts} onChange={setActiveFilter} />
          <p className="text-xs font-medium text-ink-muted">
            Showing {filteredItems.length} of {total} searches
          </p>
        </div>

      </section>

      <HistoryList
        items={filteredItems}
        isLoading={isLoading}
        emptyForFilter={activeFilter !== 'all'}
        onReSearch={handleReSearch}
      />
    </PageContainer>
  )
}
