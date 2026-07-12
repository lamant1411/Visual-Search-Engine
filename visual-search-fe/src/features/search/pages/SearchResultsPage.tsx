import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLocation, useSearchParams } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'

import { PageContainer } from '@/components/layout/PageContainer'
import { Button } from '@/components/base/button'
import { Skeleton } from '@/components/base/loader'

import { ResultGrid } from '../components/ResultGrid'
import { SearchResultDetailModal } from '../components/SearchResultDetailModal'
import { searchByImage, searchByText } from '../services/search.api'
import { useBookmarks } from '../hooks/useBookmarks'
import type { SearchMode, SearchResponse, SearchResult } from '../types'

type SearchLocationState = {
  file?: File
  fileName?: string
}

const pageLimit = 20

const modeLabel: Record<SearchMode, string> = {
  image: 'IMAGE SEARCH',
  semantic: 'SEMANTIC SEARCH',
  ocr: 'OCR SEARCH',
}

export function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const state = (location.state ?? {}) as SearchLocationState

  const mode = parseSearchMode(searchParams.get('mode'))
  const query = searchParams.get('q') ?? ''
  const imageId = parseOptionalPositiveNumber(searchParams.get('imageId'))
  const page = parsePositiveNumber(searchParams.get('page'), 1)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const { isBookmarked, toggleBookmark } = useBookmarks()
  const resultTitle = getResultTitle(mode, query, state.fileName, imageId)
  const queryEnabled = mode === 'image' ? Boolean(state.file || imageId) : query.trim().length > 0
  const imageSearchKey = state.file
    ? `${state.file.name}-${state.file.size}-${state.file.lastModified}`
    : imageId
      ? `image-${imageId}`
      : 'no-image'
  const searchQuery = useQuery({
    queryKey: ['search-results', mode, query, imageId, page, pageLimit, imageSearchKey],
    queryFn: () => runSearch({ mode, query, imageId, page, limit: pageLimit, file: state.file }),
    enabled: queryEnabled,
  })

  const response = searchQuery.data
  const total = response?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageLimit))

  return (
    <div className="min-h-screen bg-surface-0">
      <PageContainer size="wide" className="max-w-7xl space-y-6 pb-10 pt-8">
        <section className="text-center">
          <p className="text-xs font-bold uppercase text-accent-600">{modeLabel[mode]}</p>
          <h1 className="font-display mt-2 text-3xl font-bold text-ink-primary sm:text-4xl">{resultTitle}</h1>
        </section>

        {queryEnabled ? (
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-ink-primary">{total} results</p>
              <p className="mt-1 text-sm text-ink-secondary">
                Page {page} / {totalPages}. Sorted by highest similarity.
              </p>
            </div>

            <span className="w-fit rounded-full border border-border bg-white px-3 py-1 text-xs font-bold text-ink-secondary shadow-sm shadow-slate-200/70">
              20 images per page
            </span>
          </div>
        ) : (
          <section className="rounded-lg border border-border bg-white p-6 text-center shadow-sm shadow-slate-200/70">
            <p className="font-semibold text-ink-primary">Start a search to view results</p>
            <p className="mt-2 text-sm text-ink-secondary">Enter a description, OCR text, or choose a reference image above.</p>
          </section>
        )}

        {queryEnabled && searchQuery.isLoading && <ResultGridSkeleton limit={pageLimit} />}

        {queryEnabled && searchQuery.isError && (
          <section className="rounded-lg border border-red-200 bg-red-50 p-6">
            <p className="font-semibold text-red-700">Search failed</p>
            <p className="mt-1 text-sm text-red-600">Try again or start a new search.</p>
          </section>
        )}

        {queryEnabled && searchQuery.isSuccess && response && response.items.length === 0 && (
          <section className="rounded-lg border border-border bg-white p-8 text-center shadow-sm shadow-slate-200/70">
            <p className="font-semibold text-ink-primary">No matching results</p>
            <p className="mt-2 text-sm text-ink-secondary">Try another description or choose a different reference image.</p>
          </section>
        )}

        {queryEnabled && searchQuery.isSuccess && response && response.items.length > 0 && (
          <>
            <ResultGrid
              results={response.items}
              isBookmarked={isBookmarked}
              onBookmark={(result) => toggleBookmark(result.id)}
              onSelectResult={setSelectedResult}
            />

            <div className="flex items-center justify-center gap-3 border-t border-border pt-6">
              <Button
                type="button"
                variant="outline"
                className="focus-visible:ring-accent-600"
                disabled={page <= 1}
                leftIcon={<ChevronLeft className="h-4 w-4" />}
                onClick={() => updateSearchParams(page - 1)}
              >
                Previous
              </Button>

              <span className="text-sm font-semibold text-ink-secondary">
                {page} / {totalPages}
              </span>

              <Button
                type="button"
                variant="outline"
                className="focus-visible:ring-accent-600"
                disabled={page >= totalPages}
                rightIcon={<ChevronRight className="h-4 w-4" />}
                onClick={() => updateSearchParams(page + 1)}
              >
                Next
              </Button>
            </div>
          </>
        )}
      </PageContainer>

      {selectedResult && (
        <SearchResultDetailModal
          result={selectedResult}
          isBookmarked={isBookmarked(selectedResult.id)}
          onClose={() => setSelectedResult(null)}
          onBookmark={(result) => toggleBookmark(result.id)}
          onFindSimilar={handleFindSimilarResult}
        />
      )}
    </div>
  )

  function handleFindSimilarResult(result: SearchResult) {
    const nextParams = new URLSearchParams()
    nextParams.set('mode', 'image')
    nextParams.set('imageId', String(result.id))
    nextParams.set('page', '1')
    nextParams.set('limit', String(pageLimit))

    setSelectedResult(null)
    setSearchParams(nextParams, { state: null })
  }

  function updateSearchParams(nextPage: number) {
    const nextParams = new URLSearchParams(searchParams)
    nextParams.set('mode', mode)
    if (query) {
      nextParams.set('q', query)
    }
    if (imageId) {
      nextParams.set('imageId', String(imageId))
    }
    nextParams.set('page', String(nextPage))
    nextParams.set('limit', String(pageLimit))

    setSearchParams(nextParams, { state: location.state })
  }
}

function parseSearchMode(value: string | null): SearchMode {
  if (value === 'image' || value === 'semantic' || value === 'ocr') {
    return value
  }

  return 'semantic'
}

function getResultTitle(mode: SearchMode, query: string, fileName?: string, imageId?: number) {
  if (mode === 'image') {
    if (imageId) {
      return `Images similar to #${imageId}`
    }

    return fileName ? `Results for ${fileName}` : 'Image search results'
  }

  return query ? `Results for “${query}”` : 'Search results'
}

function parsePositiveNumber(value: string | null, fallback: number) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback
}

function parseOptionalPositiveNumber(value: string | null) {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
}

function runSearch({
  mode,
  query,
  imageId,
  page,
  limit,
  file,
}: {
  mode: SearchMode
  query: string
  imageId?: number
  page: number
  limit: number
  file?: File
}): Promise<SearchResponse> {
  if (mode === 'image') {
    return searchByImage({ file, imageId, page, limit })
  }

  return searchByText({
    q: query,
    mode,
    page,
    limit,
  })
}

function ResultGridSkeleton({ limit }: { limit: number }) {
  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
      {Array.from({ length: limit }).map((_, index) => (
        <div key={index} className="mb-5 break-inside-avoid rounded-lg bg-white p-2 shadow-sm">
          <Skeleton height={index % 3 === 0 ? 260 : 190} className="overflow-hidden rounded-md" />
          <Skeleton lines={1} className="mt-3" />
        </div>
      ))}
    </div>
  )
}
