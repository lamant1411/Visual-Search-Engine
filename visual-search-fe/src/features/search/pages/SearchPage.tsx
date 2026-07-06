import { useEffect, useMemo, useState } from 'react'

import { PageContainer } from '@/components/layout/PageContainer'
import { mockSearchResults } from '@/mocks/searchMockData'

import { ResultGrid } from '../components/ResultGrid'
import { SearchModeTabs } from '../components/SearchModeTabs'
import { SearchPanel } from '../components/SearchPanel'
import type { SearchMode, SearchResult } from '../types'

const allowedImageTypes = ['image/jpeg', 'image/png', 'image/webp']
const maxImageSize = 10 * 1024 * 1024

export function SearchPage() {
  const [mode, setMode] = useState<SearchMode>('semantic')
  const [query, setQuery] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [uploadError, setUploadError] = useState<string>()
  const [hasSearched, setHasSearched] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])

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
    setHasSearched(false)
    setResults([])
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
    setHasSearched(false)
    setResults([])
  }

  function handleClearFile() {
    setSelectedFile(null)
    setUploadError(undefined)
    setHasSearched(false)
    setResults([])
  }

  function handleSearch() {
    if (!canSearch) {
      if (mode === 'image') {
        setUploadError('Please choose an image before searching.')
      }
      return
    }

    setHasSearched(true)
    setResults(mockSearchResults)
  }

  return (
    <PageContainer size="wide" className="space-y-8">
      <section className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase text-accent-600">Visual Search Engine</p>
          <h1 className="mt-2 text-3xl font-bold text-ink-primary">Search images by text or image</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
            Choose a search mode and use mock results while the search API is being finalized.
          </p>
        </div>

        <SearchModeTabs value={mode} onChange={handleModeChange} />
      </section>

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

      <ResultGrid hasSearched={hasSearched} results={results} />
    </PageContainer>
  )
}
