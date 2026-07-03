import { useState } from 'react'

import { PageContainer } from '@/components/layout/PageContainer'
import { mockSearchResults } from '@/mocks/searchMockData'

import { ResultGrid } from '../components/ResultGrid'
import { SearchModeTabs } from '../components/SearchModeTabs'
import { SearchPanel } from '../components/SearchPanel'
import type { SearchMode, SearchResult } from '../types'

export function SearchPage() {
  const [mode, setMode] = useState<SearchMode>('semantic')
  const [query, setQuery] = useState('')
  const [selectedFileName, setSelectedFileName] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])

  function handleModeChange(nextMode: SearchMode) {
    setMode(nextMode)
    setHasSearched(false)
    setResults([])
  }

  function handleSearch() {
    setHasSearched(true)
    setResults(mockSearchResults)
  }

  return (
    <PageContainer size="wide" className="space-y-8">
      <section className="space-y-4">
        <div>
          <p className="text-sm font-semibold uppercase text-accent-600">Visual Search Engine</p>
          <h1 className="mt-2 text-3xl font-bold text-ink-primary">Search Page Skeleton</h1>
          <p className="mt-2 max-w-2xl text-sm text-ink-secondary">
            Day 1: choose a search mode, enter a query or select image mode, then show simple mock results.
          </p>
        </div>

        <SearchModeTabs value={mode} onChange={handleModeChange} />
      </section>

      <SearchPanel
        mode={mode}
        query={query}
        selectedFileName={selectedFileName}
        onFileNameChange={setSelectedFileName}
        onQueryChange={setQuery}
        onSubmit={handleSearch}
      />

      <ResultGrid hasSearched={hasSearched} results={results} />
    </PageContainer>
  )
}
