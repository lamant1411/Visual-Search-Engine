import { type ChangeEvent, type FormEvent, useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ArrowLeft, ArrowRight, ChevronLeft, ChevronRight, ImagePlus, Search, X } from 'lucide-react'

import { PageContainer } from '@/components/layout/PageContainer'
import { Button } from '@/components/base/button'
import { Skeleton } from '@/components/base/loader'

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
  const canSubmitSearch = draftMode === 'image' ? Boolean(selectedFile || imageId) : draftQuery.trim().length > 0
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
          className="sticky top-3 z-20 rounded-lg border border-white/80 bg-white/95 p-3 shadow-lg shadow-slate-300/25 backdrop-blur"
        >
          <div className="grid gap-3 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center">
            <SearchModeTabs value={draftMode} onChange={handleDraftModeChange} />

            {draftMode === 'image' ? (
              <div className="flex min-h-12 flex-col gap-2 lg:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                  <label className="inline-flex h-12 cursor-pointer items-center justify-center gap-2 rounded-full border border-border bg-surface-0 px-5 text-sm font-semibold text-ink-primary transition hover:border-slate-400 hover:bg-white">
                    <ImagePlus className="h-4 w-4" />
                    {selectedFile ? 'Change image' : 'Choose image'}
                    <input
                      accept="image/jpeg,image/png,image/webp"
                      className="sr-only"
                      type="file"
                      onChange={handleFileInputChange}
                    />
                  </label>

                  <div className="flex min-h-12 flex-1 items-center justify-between gap-3 rounded-full bg-surface-0 px-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-ink-primary">
                        {selectedFile?.name ?? (imageId ? `Using image #${imageId}` : 'No image selected')}
                      </p>
                      <p className="text-xs text-ink-muted">
                        JPG, PNG, or WebP, up to 10MB
                      </p>
                    </div>

                    {selectedFile && (
                      <button
                        aria-label="Remove selected image"
                        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-muted hover:bg-white hover:text-ink-primary"
                        type="button"
                        onClick={handleClearFile}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </div>

                  <button
                    aria-label="Search by image"
                    className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                    disabled={!canSubmitSearch}
                    type="submit"
                  >
                    <ArrowRight className="h-5 w-5" />
                  </button>
                </div>

                {previewUrl && selectedFile && (
                  <img
                    alt="Selected search preview"
                    className="h-24 w-36 rounded-md object-cover shadow-sm"
                    src={previewUrl}
                  />
                )}

                {uploadError && <p className="text-sm font-medium text-red-600">{uploadError}</p>}
              </div>
            ) : (
              <>
                <div className="flex h-12 items-center gap-3 rounded-full bg-surface-0 px-4">
                  <Search className="h-5 w-5 shrink-0 text-ink-muted" />
                  <input
                    className="h-full w-full bg-transparent text-base font-medium text-ink-primary outline-none placeholder:text-ink-muted"
                    onChange={(event) => setDraftQuery(event.target.value)}
                    placeholder={draftMode === 'semantic' ? 'Example: sunset on the beach' : 'Example: SALE 50%'}
                    value={draftQuery}
                  />
                </div>

                <button
                  aria-label="Search"
                  disabled={!canSubmitSearch}
                  className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
                  type="submit"
                >
                  <ArrowRight className="h-5 w-5" />
                </button>
              </>
            )}
          </div>
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

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0]
    if (nextFile) {
      handleFileSelect(nextFile)
    }

    event.target.value = ''
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
