import { useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertCircle, History, RefreshCw } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { HistoryFilters } from '@/components/feature/history/HistoryFilters'
import { HistoryList } from '@/components/feature/history/HistoryList'
import { Pagination } from '@/components/feature/result/pagination'
import { useHistory } from '@/features/history/useHistory'
import type { HistoryItem, SearchQueryType } from '@/lib/api/history'

type FilterType = 'all' | SearchQueryType

export default function HistoryPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [activeFilter, setActiveFilter] = useState<FilterType>('all')
  const queryType = activeFilter === 'all' ? undefined : activeFilter
  const {
    items,
    total,
    totalPages,
    isLoading,
    isFetching,
    error,
    refetch,
  } = useHistory(page, queryType)
  function handleReSearch(item: HistoryItem) {
    if (item.query_type === 'image') {
      if (!item.query_image_url) {
        navigate('/search', { state: { mode: 'image' } })
        return
      }

      navigate(
        `/search/results?mode=image&imageUrl=${encodeURIComponent(item.query_image_url)}&q=${encodeURIComponent(item.query_value)}&page=1&limit=20`,
      )
      return
    }

    navigate(
      `/search/results?mode=${item.query_type}&q=${encodeURIComponent(item.query_value)}&page=1&limit=20`,
    )
  }

  function handleFilterChange(filter: FilterType) {
    setActiveFilter(filter)
    setPage(1)
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
          <HistoryFilters activeFilter={activeFilter} onChange={handleFilterChange} />
          <p className="text-xs font-medium text-ink-muted">
            Showing {items.length} on this page · {total} matching searches
          </p>
        </div>

      </section>

      <HistoryList
        items={items}
        isLoading={isLoading}
        emptyForFilter={activeFilter !== 'all'}
        onReSearch={handleReSearch}
      />

      {!isLoading && !error && totalPages > 1 && (
        <Pagination
          ariaLabel="Search history pages"
          page={page}
          totalPages={totalPages}
          onChange={setPage}
        />
      )}
    </PageContainer>
  )
}
