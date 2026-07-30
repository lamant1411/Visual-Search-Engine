import { useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { AlertCircle, CheckSquare, Images, RefreshCw, RotateCcw, Search, Trash2, Undo2, X } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/base/button'
import { PageContainer } from '@/components/layout/PageContainer'
import { useAuth } from '@/contexts/AuthContext'
import { ResultGrid, ResultGridSkeleton } from '@/features/search/components/ResultGrid'
import { SearchResultDetailModal } from '@/features/search/components/SearchResultDetailModal'
import { useBookmarks } from '@/features/search/hooks/useBookmarks'
import type { SearchResult } from '@/features/search/types'
import { imageLibraryApi } from '@/lib/api/images'

const IMAGE_LIBRARY_PAGE_LIMIT = 20

type LibraryViewMode = 'indexed' | 'deleted'

export default function ImageLibraryPage() {
  const navigate = useNavigate()
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [appliedQuery, setAppliedQuery] = useState('')
  const [viewMode, setViewMode] = useState<LibraryViewMode>('indexed')
  const { user } = useAuth()
  const { isBookmarked, toggleBookmark, isToggling } = useBookmarks()
  const [mutatingImageId, setMutatingImageId] = useState<number | null>(null)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(() => new Set())
  const [selectedResultsById, setSelectedResultsById] = useState<Map<number, SearchResult>>(() => new Map())
  const [isBulkMutating, setIsBulkMutating] = useState(false)
  const canManageImages = user?.role === 'admin'
  const isDeletedView = viewMode === 'deleted'

  const listQuery = useInfiniteQuery({
    queryKey: ['image-library', viewMode, appliedQuery],
    queryFn: ({ pageParam = 1 }) => {
      const params = {
        q: appliedQuery || undefined,
        page: pageParam as number,
        limit: IMAGE_LIBRARY_PAGE_LIMIT,
      }
      return isDeletedView ? imageLibraryApi.listDeleted(params) : imageLibraryApi.list(params)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((sum, page) => sum + page.items.length, 0)
      if (lastPage.items.length < IMAGE_LIBRARY_PAGE_LIMIT || loadedCount >= lastPage.total) {
        return undefined
      }
      return allPages.length + 1
    },
  })

  const fetchNextImagePage = listQuery.fetchNextPage

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !listQuery.hasNextPage) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !listQuery.isFetchingNextPage) {
          void fetchNextImagePage()
        }
      },
      { rootMargin: '500px 0px' },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchNextImagePage, listQuery.hasNextPage, listQuery.isFetchingNextPage])

  const rawResults = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((page) => page.items),
    [listQuery.data],
  )
  const results = useMemo(() => {
    if (selectedImageIds.size === 0) return rawResults

    const selectedResults = Array.from(selectedImageIds)
      .map((imageId) => selectedResultsById.get(imageId))
      .filter((result): result is SearchResult => Boolean(result))
    const selectedIds = new Set(selectedResults.map((result) => result.id))
    const unselectedResults = rawResults.filter((result) => !selectedIds.has(result.id))
    return [...selectedResults, ...unselectedResults]
  }, [rawResults, selectedImageIds, selectedResultsById])
  const total = listQuery.data?.pages[0]?.total ?? 0
  const selectedCount = selectedImageIds.size

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAppliedQuery(searchInput.trim())
  }

  function handleClearSearch() {
    setSearchInput('')
    setAppliedQuery('')
  }

  function handleChangeViewMode(nextMode: LibraryViewMode) {
    setViewMode(nextMode)
    setSelectedResult(null)
    handleClearSelectedImages()
  }

  function handleToggleSelect(result: SearchResult) {
    setSelectedImageIds((current) => {
      const next = new Set(current)
      if (next.has(result.id)) {
        next.delete(result.id)
        setSelectedResultsById((items) => {
          const nextItems = new Map(items)
          nextItems.delete(result.id)
          return nextItems
        })
      } else {
        next.add(result.id)
        setSelectedResultsById((items) => new Map(items).set(result.id, result))
      }
      return next
    })
  }

  function handleSelectVisibleImages() {
    setSelectedImageIds((current) => {
      const next = new Set(current)
      for (const result of rawResults) {
        next.add(result.id)
      }
      return next
    })
    setSelectedResultsById((current) => {
      const next = new Map(current)
      for (const result of rawResults) {
        next.set(result.id, result)
      }
      return next
    })
  }

  function handleClearSelectedImages() {
    setSelectedImageIds(new Set())
    setSelectedResultsById(new Map())
  }

  async function handleSoftDeleteSelectedImages() {
    const imageIds = Array.from(selectedImageIds)
    if (imageIds.length === 0 || isBulkMutating) return
    if (!confirm(`Move ${imageIds.length} selected image(s) to deleted images?`)) return

    setIsBulkMutating(true)
    try {
      const result = await imageLibraryApi.bulkDelete(imageIds)
      removeSelectedIds(result.deleted_items.map((item) => item.image_id))
      await listQuery.refetch()
      if (result.failed_count > 0) {
        alert(`Moved ${result.deleted_count} image(s). Failed to move ${result.failed_count} image(s).`)
      }
    } catch (error) {
      console.error('[ImageLibraryPage] Soft delete selected images failed', error)
      alert('Unable to move selected images to deleted images. Check the API response or backend logs.')
    } finally {
      setIsBulkMutating(false)
    }
  }

  async function handleRestoreSelectedImages() {
    const imageIds = Array.from(selectedImageIds)
    if (imageIds.length === 0 || isBulkMutating) return

    setIsBulkMutating(true)
    try {
      const result = await imageLibraryApi.bulkRestore(imageIds)
      removeSelectedIds(result.restored_items.map((item) => item.image_id))
      await listQuery.refetch()
      if (result.failed_count > 0) {
        alert(`Restored ${result.restored_count} image(s). Failed to restore ${result.failed_count} image(s).`)
      }
    } catch (error) {
      console.error('[ImageLibraryPage] Restore selected images failed', error)
      alert('Unable to restore selected images. Check the API response or backend logs.')
    } finally {
      setIsBulkMutating(false)
    }
  }

  async function handlePermanentDeleteSelectedImages() {
    const imageIds = Array.from(selectedImageIds)
    if (imageIds.length === 0 || isBulkMutating) return
    if (!confirm(`Permanently delete ${imageIds.length} selected image(s)? This cannot be undone.`)) return

    setIsBulkMutating(true)
    try {
      const result = await imageLibraryApi.bulkPermanentDelete(imageIds)
      removeSelectedIds(result.deleted_items.map((item) => item.image_id))
      await listQuery.refetch()
      if (result.failed_count > 0) {
        alert(`Deleted ${result.deleted_count} image(s). Failed to delete ${result.failed_count} image(s).`)
      }
    } catch (error) {
      console.error('[ImageLibraryPage] Permanently delete selected images failed', error)
      alert('Unable to permanently delete selected images. Check the API response or backend logs.')
    } finally {
      setIsBulkMutating(false)
    }
  }

  function removeSelectedIds(imageIds: number[]) {
    const changedIds = new Set(imageIds)
    setSelectedImageIds((current) => {
      const next = new Set(current)
      for (const imageId of changedIds) {
        next.delete(imageId)
      }
      return next
    })
    setSelectedResultsById((current) => {
      const next = new Map(current)
      for (const imageId of changedIds) {
        next.delete(imageId)
      }
      return next
    })
    if (selectedResult && changedIds.has(selectedResult.id)) {
      setSelectedResult(null)
    }
  }

  function handleBookmark(result: SearchResult) {
    if (isToggling || isDeletedView) return
    toggleBookmark(result.id)
  }

  async function handleSoftDeleteSelectedImage() {
    if (!selectedResult || mutatingImageId) return
    if (!confirm('Move this image to deleted images? You can restore it later.')) return

    setMutatingImageId(selectedResult.id)
    try {
      await imageLibraryApi.delete(selectedResult.id)
      setSelectedResult(null)
      await listQuery.refetch()
    } catch (error) {
      console.error('[ImageLibraryPage] Soft delete image failed', error)
      alert('Unable to move this image to deleted images. Check the API response or backend logs.')
    } finally {
      setMutatingImageId(null)
    }
  }

  async function handleRestoreSelectedImage() {
    if (!selectedResult || mutatingImageId) return

    setMutatingImageId(selectedResult.id)
    try {
      await imageLibraryApi.restore(selectedResult.id)
      setSelectedResult(null)
      await listQuery.refetch()
    } catch (error) {
      console.error('[ImageLibraryPage] Restore image failed', error)
      alert('Unable to restore this image. Check the API response or backend logs.')
    } finally {
      setMutatingImageId(null)
    }
  }

  async function handlePermanentDeleteSelectedImage() {
    if (!selectedResult || mutatingImageId) return
    if (!confirm('Permanently delete this image? This cannot be undone.')) return

    setMutatingImageId(selectedResult.id)
    try {
      await imageLibraryApi.permanentDelete(selectedResult.id)
      setSelectedResult(null)
      await listQuery.refetch()
    } catch (error) {
      console.error('[ImageLibraryPage] Permanently delete image failed', error)
      alert('Unable to permanently delete this image. Check the API response or backend logs.')
    } finally {
      setMutatingImageId(null)
    }
  }

  function handleFindSimilar(result: SearchResult) {
    setSelectedResult(null)
    navigate(`/search/results?mode=image&imageId=${result.id}&page=1&limit=20`)
  }

  const isInitialLoading = listQuery.isLoading
  const hasResults = results.length > 0

  return (
    <>
      <PageContainer size="wide" className="space-y-7 py-8 sm:py-10">
        <header className="flex flex-col gap-5 border-b border-border pb-6 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-accent-600">Image library</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold text-ink-primary sm:text-4xl">
                {isDeletedView ? 'Deleted images' : 'Browse indexed images'}
              </h1>
              {!isInitialLoading && total > 0 && (
                <span className="inline-flex min-h-8 items-center rounded-full border border-border bg-white px-3 text-sm font-semibold text-ink-secondary shadow-sm">
                  {total.toLocaleString('vi-VN')}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-ink-secondary sm:text-base">
              {isDeletedView
                ? 'Review soft-deleted images, restore them, or permanently remove them from the system.'
                : 'Explore images that have been indexed and are ready for visual search.'}
            </p>
          </div>

          <div className="flex w-full max-w-2xl flex-col gap-3">
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                type="button"
                variant={!isDeletedView ? 'primary' : 'outline'}
                size="sm"
                onClick={() => handleChangeViewMode('indexed')}
              >
                Indexed images
              </Button>
              <Button
                type="button"
                variant={isDeletedView ? 'primary' : 'outline'}
                size="sm"
                onClick={() => handleChangeViewMode('deleted')}
              >
                Deleted images
              </Button>
            </div>

            {canManageImages && (
              <div className="flex flex-wrap items-center justify-end gap-2 rounded-2xl border border-border bg-white p-2 shadow-sm">
                <span className="mr-auto px-2 text-xs font-bold text-ink-secondary">
                  {selectedCount > 0 ? `${selectedCount} selected` : 'Select images'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  leftIcon={<CheckSquare className="h-4 w-4" />}
                  onClick={handleSelectVisibleImages}
                >
                  Select visible
                </Button>
                {selectedCount > 0 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    leftIcon={<X className="h-4 w-4" />}
                    onClick={handleClearSelectedImages}
                  >
                    Clear
                  </Button>
                )}
                {isDeletedView ? (
                  <>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={selectedCount === 0 || isBulkMutating}
                      leftIcon={<Undo2 className="h-4 w-4" />}
                      onClick={handleRestoreSelectedImages}
                    >
                      {isBulkMutating ? 'Processing...' : 'Restore selected'}
                    </Button>
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      disabled={selectedCount === 0 || isBulkMutating}
                      leftIcon={<Trash2 className="h-4 w-4" />}
                      onClick={handlePermanentDeleteSelectedImages}
                    >
                      {isBulkMutating ? 'Deleting...' : 'Delete permanently'}
                    </Button>
                  </>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    disabled={selectedCount === 0 || isBulkMutating}
                    leftIcon={<Trash2 className="h-4 w-4" />}
                    onClick={handleSoftDeleteSelectedImages}
                  >
                    {isBulkMutating ? 'Moving...' : 'Move to deleted'}
                  </Button>
                )}
              </div>
            )}

            <form className="flex w-full gap-2" onSubmit={handleSubmit}>
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Search image library</span>
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <input
                  className="h-11 w-full rounded-full border border-border bg-white pl-9 pr-4 text-sm font-semibold text-ink-primary outline-none transition focus:border-accent-600 focus:ring-4 focus:ring-accent-100"
                  value={searchInput}
                  placeholder="Search filename or OCR text..."
                  onChange={(event) => setSearchInput(event.target.value)}
                />
              </label>
              <Button type="submit" className="rounded-full">
                Search
              </Button>
              {appliedQuery && (
                <Button type="button" variant="outline" className="rounded-full" onClick={handleClearSearch}>
                  Clear
                </Button>
              )}
            </form>
          </div>
        </header>

        {listQuery.error ? (
          <ErrorState onRetry={() => void listQuery.refetch()} />
        ) : isInitialLoading ? (
          <ResultGridSkeleton limit={IMAGE_LIBRARY_PAGE_LIMIT} />
        ) : !hasResults ? (
          <EmptyState hasQuery={Boolean(appliedQuery)} isDeletedView={isDeletedView} onClear={handleClearSearch} />
        ) : (
          <>
            <ResultGrid
              results={results}
              isBookmarked={isDeletedView ? undefined : isBookmarked}
              showSimilarity={false}
              onBookmark={isDeletedView ? undefined : handleBookmark}
              onSelectResult={setSelectedResult}
              selectable={canManageImages}
              isSelected={(imageId) => selectedImageIds.has(imageId)}
              onToggleSelect={handleToggleSelect}
            />

            {listQuery.isFetchingNextPage && (
              <div className="mt-5">
                <ResultGridSkeleton limit={8} />
              </div>
            )}

            {listQuery.isFetchNextPageError && (
              <div className="flex flex-col items-center gap-3 border-t border-border pt-6 text-center">
                <p className="text-sm font-semibold text-red-700">Unable to load more images.</p>
                <Button
                  type="button"
                  variant="outline"
                  leftIcon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => void fetchNextImagePage()}
                >
                  Try again
                </Button>
              </div>
            )}
          </>
        )}

        {listQuery.hasNextPage && <div ref={loadMoreRef} className="h-10 w-full" />}
      </PageContainer>

      {selectedResult && (
        <>
          <SearchResultDetailModal
            result={selectedResult}
            isBookmarked={!isDeletedView && isBookmarked(selectedResult.id)}
            showSimilarity={false}
            onBookmark={isDeletedView ? undefined : handleBookmark}
            onClose={() => setSelectedResult(null)}
            onFindSimilar={isDeletedView ? undefined : handleFindSimilar}
          />
          {canManageImages && (
            <div className="fixed bottom-6 right-6 z-[60] flex flex-wrap justify-end gap-2">
              {isDeletedView ? (
                <>
                  <button
                    type="button"
                    disabled={mutatingImageId === selectedResult.id}
                    className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-3 text-sm font-bold text-ink-primary shadow-xl shadow-slate-900/20 ring-1 ring-border transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handleRestoreSelectedImage}
                  >
                    <Undo2 className="h-4 w-4" />
                    {mutatingImageId === selectedResult.id ? 'Restoring...' : 'Restore image'}
                  </button>
                  <button
                    type="button"
                    disabled={mutatingImageId === selectedResult.id}
                    className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-red-900/20 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                    onClick={handlePermanentDeleteSelectedImage}
                  >
                    <Trash2 className="h-4 w-4" />
                    {mutatingImageId === selectedResult.id ? 'Deleting...' : 'Delete permanently'}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  disabled={mutatingImageId === selectedResult.id}
                  className="inline-flex items-center gap-2 rounded-full bg-red-600 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-red-900/20 transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
                  onClick={handleSoftDeleteSelectedImage}
                >
                  <Trash2 className="h-4 w-4" />
                  {mutatingImageId === selectedResult.id ? 'Moving...' : 'Move to deleted'}
                </button>
              )}
            </div>
          )}
        </>
      )}
    </>
  )
}

function EmptyState({
  hasQuery,
  isDeletedView,
  onClear,
}: {
  hasQuery: boolean
  isDeletedView: boolean
  onClear: () => void
}) {
  return (
    <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-border px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-1 text-ink-secondary">
        <Images className="h-6 w-6" />
      </div>
      <h2 className="font-display mt-5 text-xl font-bold text-ink-primary">
        {hasQuery ? 'No matching images' : isDeletedView ? 'No deleted images' : 'No indexed images yet'}
      </h2>
      <p className="mt-2 max-w-md text-sm text-ink-secondary">
        {hasQuery
          ? 'Try another keyword or clear the current filter.'
          : isDeletedView
            ? 'Soft-deleted images will appear here so they can be restored or permanently deleted.'
            : 'Indexed images will appear here after admin batch indexing is completed.'}
      </p>
      {hasQuery && (
        <Button className="mt-6" type="button" variant="outline" onClick={onClear}>
          Clear search
        </Button>
      )}
    </section>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h2 className="font-semibold">Unable to load image library</h2>
          <p className="mt-1 text-sm text-red-700">Check the connection and try again.</p>
        </div>
      </div>
      <Button
        aria-label="Retry loading image library"
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