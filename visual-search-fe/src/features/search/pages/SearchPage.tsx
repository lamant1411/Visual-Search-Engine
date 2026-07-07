import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'

import { PageContainer } from '@/components/layout/PageContainer'
import { mockSearchResults } from '@/mocks/searchMockData'

import { SearchModeTabs } from '../components/SearchModeTabs'
import { SearchPanel } from '../components/SearchPanel'
import type { SearchMode } from '../types'

const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxImageSize = 10 * 1024 * 1024

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
    if (!allowedImageTypes.includes(file.type)) {
      setSelectedFile(null)
      setUploadError('Only JPG, PNG, or WebP images are supported.')
      return
    }

    if (file.size > maxImageSize) {
      setSelectedFile(null)
      setUploadError('Image size must be 10MB or smaller.')
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
    <main className="min-h-screen bg-white">
      <PageContainer size="wide" className="space-y-12 py-8 sm:py-12">
        <header className="flex items-center justify-between gap-4">
          <div>
            <p className="text-lg font-extrabold text-ink-primary">VisualSearch</p>
            <p className="text-xs font-medium uppercase text-ink-muted">Image search engine</p>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-semibold text-ink-secondary sm:flex">
            <Link className="hover:text-ink-primary" to="/search">Search</Link>
            <Link className="hover:text-ink-primary" to="/history">History</Link>
            <Link className="hover:text-ink-primary" to="/admin">Admin</Link>
          </nav>
        </header>

        <section className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_430px]">
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase text-accent-600">Visual Search Engine</p>
            <h1 className="mt-4 text-4xl font-extrabold leading-tight text-ink-primary sm:text-5xl">
              Find the right image by meaning, text, or visual similarity.
            </h1>
            <p className="mt-4 max-w-2xl text-base text-ink-secondary">
              Search across visual content with semantic text, OCR text, or an uploaded reference image.
            </p>

            <div className="mt-8 space-y-4">
              <SearchModeTabs value={mode} onChange={handleModeChange} />

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
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
            {mockSearchResults.slice(0, 2).map((result) => (
              <article key={result.id} className="relative overflow-hidden rounded-2xl bg-surface-1 shadow-sm">
                <img
                  alt={`Featured image ${result.id}`}
                  className="h-56 w-full object-cover"
                  src={result.imageUrl}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-5 text-white">
                  <p className="text-sm font-medium opacity-90">Similarity sample</p>
                  <p className="mt-1 text-2xl font-bold">{Math.round(result.similarityScore)}% match</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <div className="flex flex-wrap gap-3 border-t border-border pt-6 text-sm font-medium text-ink-secondary">
          <span className="text-ink-muted">Try:</span>
          {['sunset on the beach', 'SALE 50%', 'green forest', 'product label'].map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="rounded-full border border-border px-4 py-2 hover:border-accent-600 hover:text-accent-600"
              onClick={() => {
                setMode(suggestion.includes('%') ? 'ocr' : 'semantic')
                setQuery(suggestion)
              }}
            >
              {suggestion}
            </button>
          ))}
        </div>
      </PageContainer>
    </main>
  )
}
