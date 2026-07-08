import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { ChevronDown, FileText, ImagePlus, LogIn, ScanText, Search } from 'lucide-react'

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
    <main className="min-h-screen bg-[#f7f8fa]">
      <PageContainer size="wide" className="max-w-7xl space-y-8 pb-7 pt-3">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-slate-200/80 bg-[#f7f8fa]/90 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-950 shadow-sm shadow-slate-200/70">
              <Search className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div>
              <p className="text-lg font-bold text-slate-950">VisualSearch</p>
              <p className="text-[11px] font-semibold uppercase text-slate-400">Image search engine</p>
            </div>
          </div>

          <form
            className="hidden h-12 max-w-3xl flex-1 items-center rounded-full bg-white shadow-sm shadow-slate-200/80 ring-1 ring-slate-200/80 lg:flex"
            onSubmit={(event) => {
              event.preventDefault()
              handleSearch()
            }}
          >
            <label className="relative flex h-full shrink-0 items-center gap-2 rounded-l-full border-r border-slate-200 bg-slate-50 px-4 text-sm font-semibold text-slate-800">
              {mode === 'image' && <ImagePlus className="h-4 w-4 text-slate-400" />}
              {mode === 'semantic' && <FileText className="h-4 w-4 text-slate-400" />}
              {mode === 'ocr' && <ScanText className="h-4 w-4 text-slate-400" />}
              <select
                className="appearance-none bg-transparent pr-5 outline-none"
                value={mode}
                onChange={(event) => handleModeChange(event.target.value as SearchMode)}
              >
                <option value="image">Image</option>
                <option value="semantic">Semantic</option>
                <option value="ocr">OCR</option>
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 h-4 w-4 text-slate-400" />
            </label>

            {mode === 'image' ? (
              <label className="flex h-full min-w-0 flex-1 cursor-pointer items-center px-5 text-sm font-semibold text-slate-500">
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  type="file"
                  onChange={(event) => {
                    const nextFile = event.target.files?.[0]
                    if (nextFile) {
                      handleFileSelect(nextFile)
                    }
                    event.target.value = ''
                  }}
                />
                <span className="truncate">{selectedFile?.name ?? 'Choose an image to search'}</span>
              </label>
            ) : (
              <input
                className="h-full min-w-0 flex-1 bg-transparent px-5 text-sm font-semibold text-slate-950 outline-none placeholder:font-medium placeholder:text-slate-400"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === 'semantic' ? 'Search by description' : 'Search text in images'}
                value={query}
              />
            )}

            <button
              aria-label="Search"
              className="mr-2 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!canSearch}
              type="submit"
            >
              <Search className="h-5 w-5" />
            </button>
          </form>

          <Link
            to="/login"
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm shadow-slate-200/70 transition hover:border-slate-300 hover:text-slate-950"
          >
            <LogIn className="h-4 w-4" />
            Login
          </Link>
        </header>

        <section className="mx-auto max-w-5xl pt-2 text-center sm:pt-5">
          <h1 className="mx-auto max-w-3xl text-4xl font-semibold leading-[1.08] tracking-normal text-slate-950 sm:text-5xl lg:text-[56px]">
            Search images by meaning, text, or visual similarity.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base font-medium leading-7 text-slate-500 sm:text-lg">
            Type a natural-language idea, find text inside images, or upload a reference image to discover similar results.
          </p>
        </section>

        <div className="mx-auto max-w-2xl space-y-4 text-left">
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
