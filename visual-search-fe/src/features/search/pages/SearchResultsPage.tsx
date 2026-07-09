import { type ChangeEvent, type FormEvent, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useLocation, useSearchParams } from 'react-router'
import { ChevronDown, ChevronLeft, ChevronRight, FileText, ImagePlus, ScanText, Search, X } from 'lucide-react'

import { PageContainer } from '@/components/layout/PageContainer'
import { Button } from '@/components/base/button'
import { Skeleton } from '@/components/base/loader'

import { ResultGrid } from '../components/ResultGrid'
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
      <PageContainer size="wide" className="max-w-7xl space-y-7 pb-7 pt-3">
        <header className="sticky top-0 z-30 flex items-center gap-4 border-b border-border bg-surface-0/90 py-4 backdrop-blur">
          <Link to="/search" className="flex shrink-0 items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-white text-ink-primary shadow-sm shadow-slate-200/70">
              <Search className="h-5 w-5" strokeWidth={2.25} />
            </span>

            <div className="hidden sm:block">
              <p className="font-display text-xl font-bold text-ink-primary">VisualSearch</p>
              <p className="text-[11px] font-semibold uppercase text-slate-400">Image search engine</p>
            </div>
          </Link>

          {renderCompactSearchForm(
            'hidden h-12 max-w-3xl flex-1 items-center rounded-full bg-white shadow-sm shadow-slate-200/80 ring-1 ring-border transition duration-200 focus-within:ring-4 focus-within:ring-accent-100 lg:flex',
          )}

        </header>

        {renderCompactSearchForm(
          'sticky top-[76px] z-20 flex h-12 items-center rounded-full bg-white shadow-sm shadow-slate-200/80 ring-1 ring-border transition duration-200 focus-within:ring-4 focus-within:ring-accent-100 lg:hidden',
        )}

        {uploadError && <p className="text-sm font-medium text-red-600">{uploadError}</p>}

        <section className="py-5 text-center">
          <p className="text-xs font-bold uppercase text-accent-600">{modeLabel[mode]}</p>
          <h1 className="font-display mt-2 text-3xl font-bold text-ink-primary sm:text-4xl">{resultTitle}</h1>
        </section>

        {queryEnabled ? (
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-ink-primary">{total} results</p>
              <p className="mt-1 text-sm text-ink-secondary">
                Page {page} of {totalPages}. Sorted by highest similarity score.
              </p>
            </div>

            <span className="w-fit rounded-full border border-border bg-white px-3 py-1 text-xs font-bold text-ink-secondary shadow-sm shadow-slate-200/70">
              20 photos per page
            </span>
          </div>
        ) : (
          <section className="rounded-lg border border-border bg-white p-6 text-center shadow-sm shadow-slate-200/70">
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
          <section className="rounded-lg border border-border bg-white p-8 text-center shadow-sm shadow-slate-200/70">
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

  function renderCompactSearchForm(className: string) {
    return (
      <form className={className} onSubmit={handleSearchSubmit}>
        <label className="relative flex h-full shrink-0 cursor-pointer items-center gap-2 rounded-l-full border-r border-border bg-surface-1 px-4 text-sm font-bold text-ink-primary">
          {draftMode === 'image' && <ImagePlus className="h-4 w-4 text-accent-600" />}
          {draftMode === 'semantic' && <FileText className="h-4 w-4 text-accent-600" />}
          {draftMode === 'ocr' && <ScanText className="h-4 w-4 text-accent-600" />}
          <select
            className="cursor-pointer appearance-none bg-transparent pr-5 outline-none"
            value={draftMode}
            onChange={(event) => handleDraftModeChange(event.target.value as SearchMode)}
          >
            <option value="image">Image</option>
            <option value="semantic">Semantic</option>
            <option value="ocr">OCR</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" />
        </label>

        {draftMode === 'image' ? (
          <label className="flex h-full min-w-0 flex-1 cursor-pointer items-center px-5 text-sm font-semibold text-slate-500">
            <input
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              type="file"
              onChange={handleFileInputChange}
            />
            <span className="truncate">
              {selectedFile?.name ?? (imageId ? `Using image #${imageId}` : 'Choose an image to search')}
            </span>
          </label>
        ) : (
          <input
            className="h-full min-w-0 flex-1 bg-transparent px-5 text-sm font-bold text-ink-primary outline-none placeholder:font-medium placeholder:text-slate-400"
            onChange={(event) => setDraftQuery(event.target.value)}
            placeholder={draftMode === 'semantic' ? 'Search by description' : 'Search text in images'}
            value={draftQuery}
          />
        )}

        {draftMode === 'image' && selectedFile && (
          <button
            aria-label="Remove selected image"
            className="inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-slate-400 transition hover:bg-accent-50 hover:text-accent-700"
            type="button"
            onClick={handleClearFile}
          >
            <X className="h-4 w-4" />
          </button>
        )}

        <button
          aria-label="Search"
          className="mr-2 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-primary transition hover:bg-accent-50 hover:text-accent-700 disabled:cursor-not-allowed disabled:text-slate-300"
          disabled={!canSubmitSearch}
          type="submit"
        >
          <Search className="h-5 w-5" />
        </button>
      </form>
    )
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
