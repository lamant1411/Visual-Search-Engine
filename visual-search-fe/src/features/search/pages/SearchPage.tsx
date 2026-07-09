import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'

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
        setUploadError('Vui lòng chọn ảnh trước khi tìm kiếm.')
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
    <div className="min-h-screen bg-surface-0">
      <PageContainer size="wide" className="max-w-7xl space-y-10 pb-10 pt-8 sm:pt-12">
        <section className="mx-auto max-w-5xl text-center">
          <p className="text-xs font-bold uppercase text-ink-muted">Ngữ nghĩa, OCR, tìm ảnh tương tự</p>
          <h1 className="font-display mx-auto mt-4 max-w-4xl text-4xl font-bold leading-[1.04] tracking-normal text-ink-primary sm:text-5xl lg:text-[64px]">
            Tìm đúng hình ảnh bằng ý nghĩa, chữ trong ảnh hoặc ảnh mẫu.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base font-medium leading-7 text-ink-secondary sm:text-lg">
            Nhập mô tả tự nhiên, tìm nội dung chữ trong ảnh, hoặc tải ảnh tham chiếu để khám phá các kết quả tương tự.
          </p>
        </section>

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

        <div className="flex flex-wrap justify-center gap-2 text-sm font-medium text-ink-secondary">
          <span className="px-2 py-2 text-ink-muted">Gợi ý</span>
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

        <section aria-label="Sample image results" className="space-y-4 pt-2">
          <div className="flex items-end justify-between gap-4 border-b border-border pb-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-ink-primary">Khám phá trong thư viện</h2>
              <p className="mt-1 text-sm font-medium text-ink-secondary">Một vài ảnh mẫu để kiểm tra modal chi tiết.</p>
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
          </div>
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
    </div>
  )
}
