import { type FormEvent, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ArrowLeft, ChevronLeft, ChevronRight, Search } from 'lucide-react'

import { PageContainer } from '@/components/layout/PageContainer'
import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'
import { Skeleton } from '@/components/base/loader'

import { ImageUploadZone } from '../components/ImageUploadZone'
import { ResultGrid } from '../components/ResultGrid'
import { SearchModeTabs } from '../components/SearchModeTabs'
import { SearchResultDetailModal } from '../components/SearchResultDetailModal'
import { searchByImage, searchByText } from '../services/search.api'
import type { SearchMode, SearchResponse, SearchResult } from '../types'
import { validateSearchImageFile } from '../utils/imageValidation'

type SearchLocationState = {
  file?: File
  fileName?: string
}

const pageLimit = 20

const modeLabel: Record<SearchMode, string> = {
  image: 'Image search',
  semantic: 'Semantic search',
  ocr: 'OCR search',
}

export function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const state = (location.state ?? {}) as SearchLocationState

  const mode = parseSearchMode(searchParams.get('mode'))
  const query = searchParams.get('q') ?? ''
  const imageId = parseOptionalPositiveNumber(searchParams.get('imageId'))
  const page = parsePositiveNumber(searchParams.get('page'), 1)
  const [draftMode, setDraftMode] = useState<SearchMode>(mode)
  const [draftQuery, setDraftQuery] = useState(query)
  const [selectedFile, setSelectedFile] = useState<File | null>(state.file ?? null)
  const [uploadError, setUploadError] = useState<string>()
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const resultTitle = getResultTitle(mode, query, state.fileName, imageId)
  const queryEnabled = mode === 'image' ? Boolean(state.file || imageId) : query.trim().length > 0
  const canSubmitSearch = draftMode === 'image' ? Boolean(selectedFile) : draftQuery.trim().length > 0
  const imageSearchKey = state.file
    ? `${state.file.name}-${state.file.size}-${state.file.lastModified}`
    : imageId
      ? `image-${imageId}`
      : 'no-image'
  const previewUrl = useMemo(() => {
    if (!selectedFile) {
      return null
    }

    return URL.createObjectURL(selectedFile)
  }, [selectedFile])

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  const searchQuery = useQuery({
    queryKey: ['search-results', mode, query, imageId, page, pageLimit, imageSearchKey],
    queryFn: () => runSearch({ mode, query, imageId, page, limit: pageLimit, file: state.file }),
    enabled: queryEnabled,
  })

  const response = searchQuery.data
  const total = response?.total ?? 0
  const totalPages = Math.max(1, Math.ceil(total / pageLimit))

  return (
    <main className="min-h-screen bg-surface-0">
      <PageContainer size="wide" className="max-w-7xl space-y-8 py-6">
        <header className="flex flex-col gap-4 rounded-lg border border-border bg-white px-4 py-4 shadow-sm sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            <Link
              to="/search"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-border text-ink-secondary hover:bg-surface-1 hover:text-ink-primary"
              aria-label="Back to search"
            >
              <ArrowLeft className="h-5 w-5" />
            </Link>

            <div>
              <p className="text-sm font-semibold uppercase text-accent-600">{modeLabel[mode]}</p>
              <h1 className="mt-1 text-2xl font-bold text-ink-primary sm:text-3xl">{resultTitle}</h1>
            </div>
          </div>

          <Link to="/search">
            <Button className="bg-white" leftIcon={<Search className="h-4 w-4" />} variant="outline">
              New search
            </Button>
          </Link>
        </header>

        <form
          onSubmit={handleSearchSubmit}
          className="space-y-4 rounded-lg border border-white/80 bg-white/90 p-4 shadow-sm shadow-slate-200/70 backdrop-blur"
        >
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <SearchModeTabs value={draftMode} onChange={handleDraftModeChange} />

            <Button
              type="submit"
              disabled={!canSubmitSearch}
              className="bg-slate-950 hover:bg-slate-800 active:bg-slate-900"
              leftIcon={<Search className="h-4 w-4" />}
            >
              Search
            </Button>
          </div>

          {draftMode === 'image' ? (
            <ImageUploadZone
              errorMessage={uploadError}
              file={selectedFile}
              previewUrl={previewUrl}
              onClear={handleClearFile}
              onFileSelect={handleFileSelect}
            />
          ) : (
            <Input
              label={draftMode === 'semantic' ? 'Semantic search' : 'OCR search'}
              leftIcon={<Search className="h-5 w-5" />}
              onChange={(event) => setDraftQuery(event.target.value)}
              placeholder={draftMode === 'semantic' ? 'Example: sunset on the beach' : 'Example: SALE 50%'}
              size="lg"
              value={draftQuery}
            />
          )}
        </form>

        {queryEnabled ? (
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-white px-4 py-3 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-ink-primary">{total} results</p>
              <p className="mt-1 text-sm text-ink-secondary">
                Page {page} of {totalPages}. Sorted by highest similarity score.
              </p>
            </div>

            <span className="w-fit rounded-full bg-slate-950 px-3 py-1 text-sm font-semibold text-white">
              20 photos per page
            </span>
          </div>
        ) : (
          <section className="rounded-lg border border-border bg-white p-6 text-center shadow-sm">
            <p className="font-semibold text-ink-primary">Start a search to see results</p>
            <p className="mt-2 text-sm text-ink-secondary">
              Enter a text query or upload an image, then submit the search form above.
            </p>
          </section>
        )}

        {queryEnabled && searchQuery.isLoading && <ResultGridSkeleton limit={pageLimit} />}

        {queryEnabled && searchQuery.isError && (
          <section className="rounded-lg border border-red-200 bg-red-50 p-6">
            <p className="font-semibold text-red-700">Search failed</p>
            <p className="mt-1 text-sm text-red-600">Please try again or start a new search.</p>
          </section>
        )}

        {queryEnabled && searchQuery.isSuccess && response && response.items.length === 0 && (
          <section className="rounded-lg border border-border bg-white p-8 text-center shadow-sm">
            <p className="font-semibold text-ink-primary">No results found</p>
            <p className="mt-2 text-sm text-ink-secondary">Try a different query or another image.</p>
          </section>
        )}

        {queryEnabled && searchQuery.isSuccess && response && response.items.length > 0 && (
          <>
            <ResultGrid results={response.items} onSelectResult={setSelectedResult} />

            <div className="flex items-center justify-center gap-3 border-t border-border pt-6">
              <Button
                type="button"
                variant="outline"
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
          onClose={() => setSelectedResult(null)}
          onFindSimilar={handleFindSimilarResult}
        />
      )}
    </main>
  )

  function handleDraftModeChange(nextMode: SearchMode) {
    setDraftMode(nextMode)
    setUploadError(undefined)
  }

  function handleFileSelect(file: File) {
    const errorMessage = validateSearchImageFile(file)
    if (errorMessage) {
      setSelectedFile(null)
      setUploadError(errorMessage)
      return
    }

    setSelectedFile(file)
    setUploadError(undefined)
  }

  function handleClearFile() {
    setSelectedFile(null)
    setUploadError(undefined)
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!canSubmitSearch) {
      if (draftMode === 'image') {
        setUploadError('Please choose an image before searching.')
      }
      return
    }

    const nextParams = new URLSearchParams()
    nextParams.set('mode', draftMode)
    nextParams.set('page', '1')
    nextParams.set('limit', String(pageLimit))

    if (draftMode === 'image') {
      setSearchParams(nextParams, {
        state: {
          file: selectedFile,
          fileName: selectedFile?.name,
        },
      })
      return
    }

    nextParams.set('q', draftQuery.trim())
    setSearchParams(nextParams, { state: null })
  }

  function handleFindSimilarResult(result: SearchResult) {
    const nextParams = new URLSearchParams()
    nextParams.set('mode', 'image')
    nextParams.set('imageId', String(result.id))
    nextParams.set('page', '1')
    nextParams.set('limit', String(pageLimit))

    setSelectedResult(null)
    setDraftMode('image')
    setDraftQuery('')
    setSelectedFile(null)
    setUploadError(undefined)
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
      return `Similar images for #${imageId}`
    }

    return fileName ? `Results for ${fileName}` : 'Image search results'
  }

  return query ? `Results for "${query}"` : 'Search results'
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
