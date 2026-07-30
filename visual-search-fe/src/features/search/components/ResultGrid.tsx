import { useEffect, useMemo, useState } from 'react'

import type { SearchResult } from '../types'
import { ResultCard } from './ResultCard'
import { Skeleton } from '@/components/base/loader'

function getColumnCount() {
  if (typeof window === 'undefined') {
    return 4
  }

  if (window.innerWidth < 640) {
    return 1
  }

  if (window.innerWidth < 1024) {
    return 2
  }

  if (window.innerWidth < 1280) {
    return 3
  }

  return 4
}

function useMasonryColumnCount() {
  const [columnCount, setColumnCount] = useState(getColumnCount)

  useEffect(() => {
    const handleResize = () => {
      setColumnCount(getColumnCount())
    }

    handleResize()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
    }
  }, [])

  return columnCount
}

function splitByVisualRows<T>(items: T[], columnCount: number) {
  return items.reduce<Array<Array<{ item: T; index: number }>>>(
    (columns, item, index) => {
      columns[index % columnCount].push({ item, index })
      return columns
    },
    Array.from({ length: columnCount }, () => []),
  )
}

type ResultGridProps = {
  results: SearchResult[]
  isBookmarked?: (imageId: number) => boolean
  showSimilarity?: boolean
  onBookmark?: (result: SearchResult) => void
  onSelectResult?: (result: SearchResult) => void
}

export function ResultGrid({
  results,
  isBookmarked,
  showSimilarity = true,
  onBookmark,
  onSelectResult,
}: ResultGridProps) {
  const columnCount = useMasonryColumnCount()
  const columns = useMemo(
    () => splitByVisualRows(results, columnCount),
    [columnCount, results],
  )

  return (
    <section>
      <div className="-ml-5 flex w-auto">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="min-w-0 flex-1 bg-clip-padding pl-5">
            {column.map(({ item: result, index }) => (
              <ResultCard
                key={result.id}
                result={result}
                priority={index < columnCount}
                isBookmarked={isBookmarked?.(result.id)}
                showSimilarity={showSimilarity}
                onBookmark={onBookmark}
                onSelect={onSelectResult}
              />
            ))}
          </div>
        ))}
      </div>

      {results.length === 0 && (
        <div className="rounded-xl border border-border bg-white p-6 text-center">
          <p className="text-sm text-ink-secondary">No results available.</p>
        </div>
      )}
    </section>
  )
}

export function ResultGridSkeleton({ limit }: { limit: number }) {
  const columnCount = useMasonryColumnCount()
  const columns = useMemo(
    () => splitByVisualRows(Array.from({ length: limit }), columnCount),
    [columnCount, limit],
  )

  return (
    <div role="status">
      <span className="sr-only">Loading images...</span>
      <div className="-ml-5 flex w-auto">
        {columns.map((column, columnIndex) => (
          <div key={columnIndex} className="min-w-0 flex-1 bg-clip-padding pl-5">
            {column.map(({ index }) => (
              <div
                key={index}
                className="mb-5 break-inside-avoid rounded-lg bg-white p-2 shadow-sm"
              >
                <Skeleton
                  height={index % 3 === 0 ? 260 : index % 2 === 0 ? 320 : 190}
                  className="overflow-hidden rounded-md"
                />
                <Skeleton lines={1} className="mt-3" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
