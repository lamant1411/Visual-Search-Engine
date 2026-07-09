import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { ChevronDown, FileText, ImagePlus, ScanText, Search } from 'lucide-react'

import { PageContainer } from '@/components/layout/PageContainer'
import { mockSearchResults } from '@/mocks/searchMockData'

import { SearchModeTabs } from '../components/SearchModeTabs'
import { SearchPanel } from '../components/SearchPanel'
import { SearchResultDetailModal } from '../components/SearchResultDetailModal'
import type { SearchMode, SearchResult } from '../types'
import { validateSearchImageFile } from '../utils/imageValidation'

const featuredImageHeights = ['h-72', 'h-96', 'h-80', 'h-64', 'h-[22rem]', 'h-72']

export function SearchPage() {
  const navigate = useNavigate()
  const [mode, setMode] = useState<SearchMode>('semantic')
  const [query, setQuery] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string>()
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)

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

  function handleFindSimilarResult(result: SearchResult) {
    setSelectedResult(null)
    navigate(`/search/results?mode=image&imageId=${result.id}&page=1&limit=20`)
  }

  return (
    <main className="min-h-screen bg-surface-0">
      <PageContainer size="wide" className="max-w-7xl space-y-8 pb-7 pt-3">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-4 border-b border-border bg-surface-0/90 py-4 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-white text-ink-primary shadow-sm shadow-slate-200/70">
              <Search className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <div>
              <p className="font-display text-xl font-bold text-ink-primary">VisualSearch</p>
              <p className="text-[11px] font-semibold uppercase text-slate-400">Image search engine</p>
            </div>
          </div>

          <form
            className="hidden h-12 max-w-3xl flex-1 items-center rounded-full bg-white shadow-sm shadow-slate-200/80 ring-1 ring-border transition duration-200 focus-within:ring-4 focus-within:ring-accent-100 lg:flex"
            onSubmit={(event) => {
              event.preventDefault()
              handleSearch()
            }}
          >
            <label className="relative flex h-full shrink-0 cursor-pointer items-center gap-2 rounded-l-full border-r border-border bg-surface-1 px-4 text-sm font-bold text-ink-primary">
              {mode === 'image' && <ImagePlus className="h-4 w-4 text-accent-600" />}
              {mode === 'semantic' && <FileText className="h-4 w-4 text-accent-600" />}
              {mode === 'ocr' && <ScanText className="h-4 w-4 text-accent-600" />}
              <select
                className="cursor-pointer appearance-none bg-transparent pr-5 outline-none"
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
                className="h-full min-w-0 flex-1 bg-transparent px-5 text-sm font-bold text-ink-primary outline-none placeholder:font-medium placeholder:text-slate-400"
                onChange={(event) => setQuery(event.target.value)}
                placeholder={mode === 'semantic' ? 'Search by description' : 'Search text in images'}
                value={query}
              />
            )}

            <button
              aria-label="Search"
              className="mr-2 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-primary transition hover:bg-accent-50 hover:text-accent-700 disabled:cursor-not-allowed disabled:text-slate-300"
              disabled={!canSearch}
              type="submit"
            >
              <Search className="h-5 w-5" />
            </button>
          </form>

        </header>

        <section className="mx-auto max-w-5xl pt-4 text-center sm:pt-8">
          <h1 className="font-display mx-auto max-w-3xl text-4xl font-bold leading-[1.05] tracking-normal text-ink-primary sm:text-5xl lg:text-[58px]">
            Tìm kiếm hình ảnh theo ngữ nghĩa, chữ trong ảnh hoặc độ tương đồng hình ảnh.
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base font-medium leading-7 text-ink-secondary sm:text-lg">
            Nhập mô tả bằng ngôn ngữ tự nhiên, tìm chữ xuất hiện trong ảnh hoặc tải lên ảnh tham chiếu để tìm kết quả tương tự.
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

        <section aria-label="Sample image results" className="columns-1 gap-4 pt-2 sm:columns-2 lg:columns-3">
          {mockSearchResults.slice(0, 9).map((result, index) => (
            <button
              key={result.id}
              type="button"
              className={[
                'group relative mb-4 block w-full cursor-pointer break-inside-avoid overflow-hidden rounded-lg bg-surface-1 text-left shadow-sm shadow-slate-200/80 ring-1 ring-white/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface-0',
                featuredImageHeights[index % featuredImageHeights.length],
              ].join(' ')}
              aria-label={`Open detail for sample image ${result.id}`}
              onClick={() => setSelectedResult(result)}
            >
              <img
                alt={`Featured image ${result.id}`}
                className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
                src={result.imageUrl}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 to-transparent p-4 text-white opacity-0 transition duration-200 group-hover:opacity-100 group-focus-within:opacity-100">
                <p className="text-xs font-medium opacity-90">Ảnh trong thư viện</p>
                <p className="mt-1 text-xl font-bold">{result.metadata.source ?? 'VisualSearch'}</p>
              </div>
            </button>
          ))}
        </section>
      </PageContainer>

      {selectedResult && (
        <SearchResultDetailModal
          result={selectedResult}
          showSimilarity={false}
          onClose={() => setSelectedResult(null)}
          onFindSimilar={handleFindSimilarResult}
        />
      )}
    </main>
  )
}
