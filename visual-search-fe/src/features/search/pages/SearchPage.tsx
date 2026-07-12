import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

import { PageContainer } from '@/components/layout/PageContainer'
import { useAuth } from '@/contexts/AuthContext'
import { mockSearchResults } from '@/mocks/searchMockData'

import { SearchModeTabs } from '../components/SearchModeTabs'
import { SearchLoginModal } from '../components/SearchLoginModal'
import { SearchPanel } from '../components/SearchPanel'
import { SearchResultDetailModal } from '../components/SearchResultDetailModal'
import { useBookmarks } from '../hooks/useBookmarks'
import type { SearchMode, SearchResult } from '../types'
import { validateSearchImageFile } from '../utils/imageValidation'

const featuredImageHeights = ['h-72', 'h-96', 'h-80', 'h-64', 'h-[22rem]', 'h-72']

type PendingAction =
  | { type: 'search' }
  | { type: 'bookmark'; result: SearchResult }
  | { type: 'find-similar'; result: SearchResult }

export function SearchPage() {
  const navigate = useNavigate()
  const { isAuthenticated, isLoading: isAuthLoading } = useAuth()
  const [mode, setMode] = useState<SearchMode>('semantic')
  const [query, setQuery] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string>()
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null)
  const { isBookmarked, toggleBookmark } = useBookmarks()

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

  const canSearch = mode === 'image' ? Boolean(selectedFile) : query.trim().length > 0

  function handleModeChange(nextMode: SearchMode) {
    setMode(nextMode)
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

  function handleSearch() {
    if (!canSearch) {
      if (mode === 'image') {
        setUploadError('Please select an image before searching.')
      }
      return
    }

    if (isAuthLoading) {
      return
    }

    if (!isAuthenticated) {
      setPendingAction({ type: 'search' })
      return
    }

    executeSearch()
  }

  function executeSearch() {
    if (mode === 'image') {
      navigate('/search/results?mode=image&page=1&limit=20', {
        state: {
          file: selectedFile,
          fileName: selectedFile?.name,
        },
      })
      return
    }

    navigate(`/search/results?mode=${mode}&q=${encodeURIComponent(query.trim())}&page=1&limit=20`)
  }

  function handleFindSimilarResult(result: SearchResult) {
    if (!isAuthenticated) {
      setPendingAction({ type: 'find-similar', result })
      return
    }

    executeFindSimilar(result)
  }

  function executeFindSimilar(result: SearchResult) {
    setSelectedResult(null)
    navigate(`/search/results?mode=image&imageId=${result.id}&page=1&limit=20`)
  }

  function handleBookmarkResult(result: SearchResult) {
    if (!isAuthenticated) {
      setPendingAction({ type: 'bookmark', result })
      return
    }

    toggleBookmark(result.id)
  }

  function handleLoginSuccess() {
    const action = pendingAction
    setPendingAction(null)

    if (!action) {
      return
    }

    if (action.type === 'search') {
      executeSearch()
    } else if (action.type === 'bookmark') {
      toggleBookmark(action.result.id)
    } else {
      executeFindSimilar(action.result)
    }
  }

  return (
    <div className="min-h-screen bg-surface-0">
      <section className="relative isolate flex min-h-[500px] w-full overflow-hidden px-5 pb-24 pt-16 text-center sm:min-h-[540px] sm:px-10 sm:pt-20">
        <div aria-hidden="true" className="absolute inset-0 grid grid-cols-2 sm:grid-cols-4">
          {[0, 3, 4, 7].map((resultIndex) => (
            <img
              key={mockSearchResults[resultIndex].id}
              alt=""
              className="h-full w-full object-cover"
              src={mockSearchResults[resultIndex].imageUrl}
            />
          ))}
        </div>
        <div className="absolute inset-0 bg-slate-950/65" />

        <div className="relative z-10 m-auto max-w-5xl text-white">
          <p className="text-xs font-bold uppercase text-white/70">Semantic, OCR, and image-to-image search</p>
          <h1 className="font-display mx-auto mt-4 max-w-4xl text-4xl font-bold leading-[1.04] tracking-normal sm:text-5xl lg:text-[64px]">
            Search images by meaning, text, or visual similarity.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-white/80 sm:text-lg">
            Describe an idea, find words inside images, or upload a reference to discover visually related results.
          </p>
        </div>
      </section>

      <PageContainer size="wide" className="relative z-20 -mt-14 max-w-7xl pb-10 pt-0">

        <section className="mx-auto max-w-3xl space-y-4 text-left" aria-label="Search controls">
          <div className="flex justify-center">
            <SearchModeTabs value={mode} onChange={handleModeChange} />
          </div>

          <SearchPanel
            mode={mode}
            canSearch={canSearch}
            previewUrl={previewUrl}
            query={query}
            selectedFile={selectedFile}
            uploadError={uploadError}
            onClearFile={handleClearFile}
            onFileSelect={handleFileSelect}
            onQueryChange={setQuery}
            onSubmit={handleSearch}
          />
        </section>

        <div className="mt-5 flex flex-wrap justify-center gap-2 text-sm font-medium text-ink-secondary">
          <span className="px-2 py-2 text-ink-muted">Try</span>
          {['sunset on the beach', 'SALE 50%', 'green forest', 'product label'].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="h-10 cursor-pointer rounded-full border border-border bg-white px-4 font-semibold shadow-sm shadow-slate-200/70 transition duration-200 hover:border-accent-600 hover:text-accent-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0"
              onClick={() => {
                setMode(suggestion.includes('%') ? 'ocr' : 'semantic')
                setQuery(suggestion)
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <section aria-label="Sample image results" className="mt-12 space-y-4 pt-2">
          <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-ink-primary">Explore the library</h2>
              <p className="mt-1 text-sm font-medium text-ink-secondary">Open a sample to inspect its image details.</p>
            </div>
          </div>

          <div className="columns-1 gap-4 sm:columns-2 lg:columns-3">
            {mockSearchResults.slice(0, 9).map((result, index) => (
              <button
                key={result.id}
                type="button"
                className={[
                  'group relative mb-4 block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-[18px] bg-surface-1 text-left shadow-sm shadow-slate-200/80 ring-1 ring-white/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
                  featuredImageHeights[index % featuredImageHeights.length],
                ].join(' ')}
                aria-label={`Open details for sample image ${result.id}`}
                onClick={() => setSelectedResult(result)}
              >
                <img
                  alt={`Featured sample ${result.id}`}
                  className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                  src={result.imageUrl}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 text-white opacity-0 transition duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                  <p className="text-xs font-medium opacity-90">Library image</p>
                  <p className="mt-1 text-xl font-bold">{result.metadata.source ?? 'VisualSearch'}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      </PageContainer>

      {selectedResult && (
        <SearchResultDetailModal
          result={selectedResult}
          isBookmarked={isBookmarked(selectedResult.id)}
          showSimilarity={false}
          onClose={() => setSelectedResult(null)}
          onBookmark={handleBookmarkResult}
          onFindSimilar={handleFindSimilarResult}
        />
      )}

      {pendingAction && !isAuthLoading && (
        <SearchLoginModal onClose={() => setPendingAction(null)} onSuccess={handleLoginSuccess} />
      )}
    </div>
  )
}
