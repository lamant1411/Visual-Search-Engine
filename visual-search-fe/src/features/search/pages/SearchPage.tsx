import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Search, Sparkles } from 'lucide-react'

import { PageContainer } from '@/components/layout/PageContainer'
import { mockSearchResults } from '@/mocks/searchMockData'

import { SearchModeTabs } from '../components/SearchModeTabs'
import { SearchPanel } from '../components/SearchPanel'
import type { SearchMode } from '../types'
import { validateSearchImageFile } from '../utils/imageValidation'

const featuredImageHeights = ['h-72', 'h-96', 'h-80', 'h-64', 'h-[22rem]', 'h-72']

export function SearchPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<SearchMode>('semantic')
  const [query, setQuery] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string>()

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
        setUploadError('Please choose an image before searching.')
      }
      return
    }

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

  return (
    <main className="min-h-screen bg-[#f6f7f8]">
      <PageContainer size="wide" className="max-w-7xl space-y-7 py-5 sm:py-7">
        <header className="flex items-center justify-between gap-4 rounded-lg border border-white bg-white/80 px-3 py-3 shadow-sm shadow-slate-200/70 backdrop-blur sm:px-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-slate-950 text-white shadow-sm">
              <Search className="h-5 w-5" />
            </span>
            <div>
              <p className="text-lg font-extrabold text-ink-primary">VisualSearch</p>
              <p className="text-xs font-medium uppercase text-ink-muted">Image search engine</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-ink-secondary sm:flex">
            <Link className="hover:text-ink-primary" to="/search">Search</Link>
            <Link className="hover:text-ink-primary" to="/history">History</Link>
            <Link className="hover:text-ink-primary" to="/admin">Admin</Link>
          </nav>
        </header>

        <section className="mx-auto max-w-5xl pt-3 text-center sm:pt-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-white px-4 py-2 text-sm font-semibold text-ink-secondary shadow-sm">
            <Sparkles className="h-4 w-4 text-accent-600" />
            Semantic, OCR, and image-to-image search
          </div>

          <h1 className="mx-auto mt-5 max-w-4xl text-4xl font-extrabold leading-tight tracking-normal text-ink-primary sm:text-6xl">
            Search images by what they look like and what they mean.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-ink-secondary sm:text-lg">
            Type a natural-language idea, find text inside images, or upload a reference image to discover similar results.
          </p>

          <div className="mx-auto mt-6 max-w-3xl space-y-4 text-left">
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
          </div>
        </section>

        <div className="flex flex-wrap justify-center gap-3 text-sm font-medium text-ink-secondary">
          <span className="px-1 py-2 text-ink-muted">Try</span>
          {['sunset on the beach', 'SALE 50%', 'green forest', 'product label'].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full border border-white bg-white px-4 py-2 shadow-sm shadow-slate-200/70 hover:border-slate-300 hover:text-ink-primary"
              onClick={() => {
                setMode(suggestion.includes('%') ? 'ocr' : 'semantic')
                setQuery(suggestion)
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>

        <section className="columns-1 gap-4 pt-2 sm:columns-2 lg:columns-3">
          {mockSearchResults.slice(0, 9).map((result, index) => (
            <article
              key={result.id}
              className={[
                'group relative mb-4 break-inside-avoid overflow-hidden rounded-lg bg-surface-1 shadow-sm shadow-slate-200/80',
                featuredImageHeights[index % featuredImageHeights.length],
              ].join(' ')}
            >
              <img
                alt={`Featured image ${result.id}`}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                src={result.imageUrl}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 text-white opacity-0 transition group-hover:opacity-100">
                <p className="text-xs font-medium opacity-90">Similarity sample</p>
                <p className="mt-1 text-xl font-bold">{Math.round(result.similarityScore)}% match</p>
              </div>
            </article>
          ))}
        </section>
      </PageContainer>
    </main>
  )
}
