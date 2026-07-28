import { useMemo, useState } from 'react'
import {
  AlertCircle,
  Bookmark,
  RefreshCw,
} from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/base/button'
import { PageContainer } from '@/components/layout/PageContainer'
import { Pagination } from '@/components/feature/result/pagination'
import { useBookmark } from '@/features/bookmark/useBookmark'
import { ResultGrid } from '@/features/search/components/ResultGrid'
import { SearchResultDetailModal } from '@/features/search/components/SearchResultDetailModal'
import type { SearchResult } from '@/features/search/types'

const SKELETON_HEIGHTS = [280, 210, 340, 250, 300, 230, 360, 220, 290, 330, 240, 275]

export default function BookmarkPage() {
  const navigate = useNavigate()
  const [page, setPage] = useState(1)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const {
    items,
    total,
    totalPages,
    isLoading,
    error,
    removingImageId,
    removeItem,
    refetch,
  } = useBookmark(page)
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
    removeItem(result.id, {
      onSuccess: () => {
        if (items.length === 1 && page > 1) {
          setPage((currentPage) => currentPage - 1)
        }
      },
    })
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
          <BookmarkGridSkeleton />
        ) : results.length === 0 ? (
          <EmptyState onSearch={() => navigate('/search')} />
        ) : (
          <ResultGrid
            results={results}
            isBookmarked={() => true}
            showSimilarity={false}
            onBookmark={handleRemove}
            onSelectResult={setSelectedResult}
          />
        )}

        {!isLoading && !error && totalPages > 1 && (
          <Pagination
            ariaLabel="Bookmark pages"
            page={page}
            totalPages={totalPages}
            onChange={setPage}
          />
        )}
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
    </>
  )
}

function BookmarkGridSkeleton() {
  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4" role="status">
      <span className="sr-only">Loading saved images...</span>
      {SKELETON_HEIGHTS.map((height, index) => (
        <div
          key={`${height}-${index}`}
          className="mb-5 w-full break-inside-avoid animate-pulse rounded-lg bg-slate-200"
          style={{ height }}
        />
      ))}
    </div>
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
