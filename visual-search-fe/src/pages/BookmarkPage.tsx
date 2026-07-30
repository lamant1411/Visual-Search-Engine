import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertCircle, Bookmark, CheckCircle2, RefreshCw, RotateCcw } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/base/button'
import { PageContainer } from '@/components/layout/PageContainer'
import { useBookmark } from '@/features/bookmark/useBookmark'
import { ResultGrid, ResultGridSkeleton } from '@/features/search/components/ResultGrid'
import { SearchResultDetailModal } from '@/features/search/components/SearchResultDetailModal'
import type { SearchResult } from '@/features/search/types'

export default function BookmarkPage() {
  const navigate = useNavigate()
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [removedResult, setRemovedResult] = useState<SearchResult | null>(null)
  const {
    items,
    total,
    isLoading,
    isFetchingNextPage,
    isFetchNextPageError,
    hasNextPage,
    fetchNextPage,
    error,
    removingImageId,
    restoringImageId,
    removeItem,
    restoreItem,
    refetch,
  } = useBookmark()

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !hasNextPage) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage()
        }
      },
      { rootMargin: '500px 0px' },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchNextPage, hasNextPage, isFetchingNextPage])

  useEffect(() => {
    if (!removedResult) return

    const timer = window.setTimeout(() => {
      setRemovedResult(null)
    }, 4500)

    return () => window.clearTimeout(timer)
  }, [removedResult])

  const results = useMemo<SearchResult[]>(
    () =>
      items.map((item) => ({
        id: item.imageId,
        thumbnailUrl: item.thumbnailUrl,
        imageUrl: item.imageUrl,
        similarityScore: 0,
        metadata: item.metadata,
      })),
    [items],
  )

  function handleRemove(result: SearchResult) {
    if (removingImageId === result.id) return
    setRemovedResult(result)
    removeItem(result.id)
    if (selectedResult?.id === result.id) {
      setSelectedResult(null)
    }
  }

  function handleFindSimilar(result: SearchResult) {
    setSelectedResult(null)
    navigate(`/search/results?mode=image&imageId=${result.id}&page=1&limit=20`)
  }

  return (
    <>
      <PageContainer size="wide" className="space-y-7 py-8 sm:py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-accent-600">Your collection</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold text-ink-primary sm:text-4xl">
                Saved images
              </h1>
              {!isLoading && total > 0 && (
                <span className="inline-flex min-h-8 items-center rounded-full border border-border bg-white px-3 text-sm font-semibold text-ink-secondary shadow-sm">
                  {total}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-ink-secondary sm:text-base">
              Revisit images you saved from search results.
            </p>
          </div>
        </header>

        {error ? (
          <ErrorState onRetry={() => void refetch()} />
        ) : isLoading ? (
          <ResultGridSkeleton limit={20} />
        ) : results.length === 0 ? (
          <EmptyState onSearch={() => navigate('/search')} />
        ) : (
          <>
            <ResultGrid
              results={results}
              isBookmarked={() => true}
              showSimilarity={false}
              onBookmark={handleRemove}
              onSelectResult={setSelectedResult}
            />

            {isFetchingNextPage && (
              <div className="mt-5">
                <p className="mb-3 text-center text-sm font-semibold text-ink-secondary">
                  Loading more saved images...
                </p>
                <ResultGridSkeleton limit={8} />
              </div>
            )}

            {isFetchNextPageError && (
              <div className="flex flex-col items-center gap-3 border-t border-border pt-6 text-center">
                <p className="text-sm font-semibold text-red-700">
                  Unable to load more saved images.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  leftIcon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => void fetchNextPage()}
                >
                  Try again
                </Button>
              </div>
            )}

            {!hasNextPage && !isFetchingNextPage && results.length > 0 && (
              <p className="border-t border-border pt-6 text-center text-sm font-semibold text-ink-muted">
                All saved images are loaded.
              </p>
            )}
          </>
        )}

        {hasNextPage && <div ref={loadMoreRef} className="h-10 w-full" />}
      </PageContainer>

      {selectedResult && (
        <SearchResultDetailModal
          result={selectedResult}
          isBookmarked
          showSimilarity={false}
          onBookmark={handleRemove}
          onClose={() => setSelectedResult(null)}
          onFindSimilar={handleFindSimilar}
        />
      )}

      {removedResult && (
        <div className="fixed inset-x-4 bottom-4 z-[60] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-border bg-white p-3 shadow-2xl shadow-slate-900/15 sm:bottom-6">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <p className="min-w-0 flex-1 text-sm font-semibold text-ink-primary">
            Removed from bookmarks
          </p>
          <button
            type="button"
            disabled={restoringImageId === removedResult.id}
            className="min-h-11 rounded-lg px-3 text-sm font-bold text-accent-700 hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={() => {
              restoreItem(removedResult.id)
              setRemovedResult(null)
            }}
          >
            Undo
          </button>
          <button
            type="button"
            className="min-h-11 rounded-lg px-2 text-xs font-bold text-ink-muted hover:bg-surface-1"
            onClick={() => setRemovedResult(null)}
          >
            Close
          </button>
        </div>
      )}
    </>
  )
}

function EmptyState({ onSearch }: { onSearch: () => void }) {
  return (
    <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-border px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-1 text-ink-secondary">
        <Bookmark className="h-6 w-6" />
      </div>
      <h2 className="font-display mt-5 text-xl font-bold text-ink-primary">No saved images yet</h2>
      <p className="mt-2 max-w-md text-sm text-ink-secondary">
        Save an image from any search result and it will appear here.
      </p>
      <Button className="mt-6" type="button" onClick={onSearch}>
        Explore images
      </Button>
    </section>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h2 className="font-semibold">Unable to load saved images</h2>
          <p className="mt-1 text-sm text-red-700">Check the connection and try again.</p>
        </div>
      </div>
      <Button
        aria-label="Retry loading saved images"
        className="shrink-0"
        size="icon"
        type="button"
        variant="ghost"
        onClick={onRetry}
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
    </section>
  )
}
