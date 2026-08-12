import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AlertCircle, History, Loader2, RefreshCw } from 'lucide-react'

import { HistoryFilters } from '@/components/feature/history/HistoryFilters'
import { HistoryImageModal } from '@/components/feature/history/HistoryImageModal'
import { HistoryList } from '@/components/feature/history/HistoryList'
import { PageContainer } from '@/components/layout/PageContainer'
import { useHistory } from '@/features/history/useHistory'
import type { HistoryFilterType, HistoryItem } from '@/lib/api/history'

export default function HistoryPage() {
  const navigate = useNavigate()
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const [activeFilter, setActiveFilter] = useState<HistoryFilterType>('all')
  const [previewImageItem, setPreviewImageItem] = useState<HistoryItem | null>(null)
  const {
    items,
    total,
    isLoading,
    isFetching,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    error,
    refetch,
  } = useHistory(activeFilter)

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasNextPage || error) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '420px 0px' },
    )

    observer.observe(target)

    return () => observer.disconnect()
  }, [error, fetchNextPage, hasNextPage, isFetchingNextPage])

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
      `/search/results?mode=text&q=${encodeURIComponent(item.query_value)}&page=1&limit=20`,
    )
  }

  function handleFilterChange(filter: HistoryFilterType) {
    setActiveFilter(filter)
  }

  return (
    <>
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
          <div
            role="alert"
            className="flex items-center justify-between gap-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
          >
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

        <section
          aria-label="History controls"
          className="sticky top-16 z-20 -mx-4 space-y-4 border-y border-border bg-surface-0 px-4 py-3 sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <HistoryFilters activeFilter={activeFilter} onChange={handleFilterChange} />
            <p className="text-xs font-medium text-ink-muted">
              Showing {items.length} of {total} matching searches
            </p>
          </div>
        </section>

        <HistoryList
          items={items}
          isLoading={isLoading}
          emptyForFilter={activeFilter !== 'all'}
          onReSearch={handleReSearch}
          onPreviewImage={setPreviewImageItem}
        />

        {!isLoading && !error && items.length > 0 && (
          <div className="space-y-3 border-t border-border pt-5 text-center">
            {isFetchingNextPage && (
              <div className="flex min-h-14 items-center justify-center gap-2 rounded-lg border border-border bg-white text-sm font-semibold text-ink-secondary shadow-sm shadow-slate-200/40">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading more searches...
              </div>
            )}

            {isFetchNextPageError && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                Unable to load more history. Please try again.
              </div>
            )}

            {hasNextPage ? (
              <button
                type="button"
                onClick={() => void fetchNextPage()}
                disabled={isFetchingNextPage}
                className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-bold text-ink-secondary shadow-sm shadow-slate-200/50 transition-colors hover:bg-surface-1 hover:text-ink-primary disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
              >
                {isFetchingNextPage && <Loader2 className="h-4 w-4 animate-spin" />}
                Load more history
              </button>
            ) : (
              <p className="text-xs font-medium text-ink-muted">
                You have reached the end of your search history.
              </p>
            )}

            {hasNextPage && <div ref={loadMoreRef} className="h-4 w-full" />}
          </div>
        )}
      </PageContainer>

      {previewImageItem && (
        <HistoryImageModal
          item={previewImageItem}
          onClose={() => setPreviewImageItem(null)}
          onReSearch={handleReSearch}
        />
      )}
    </>
  )
}
