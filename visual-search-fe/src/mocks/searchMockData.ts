import type { SearchResult, SearchResponse } from '@/features/search/types'

const baseMockSearchResults: SearchResult[] = [
  {
    id: 1,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=480&q=80',
    imageUrl:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
    similarityScore: 94.2,
    metadata: {
      width: 1200,
      height: 800,
      source: 'Unsplash',
      ocrText: 'SUMMER SALE',
    },
  },
  {
    id: 2,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=480&q=80',
    imageUrl:
      'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
    similarityScore: 89.7,
    metadata: {
      width: 1200,
      height: 801,
      source: 'Unsplash',
    },
  },
  {
    id: 3,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=480&q=80',
    imageUrl:
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=1200&q=80',
    similarityScore: 84.5,
    metadata: {
      width: 1200,
      height: 800,
      source: 'Unsplash',
      ocrText: 'TEAM',
    },
  },
]

export const mockSearchResults: SearchResult[] = Array.from({ length: 24 }, (_, index) => {
  const baseResult = baseMockSearchResults[index % baseMockSearchResults.length]
  const pageGroup = Math.floor(index / baseMockSearchResults.length)

  return {
    ...baseResult,
    id: index + 1,
    similarityScore: Math.max(62, baseResult.similarityScore - pageGroup * 4),
  }
})

export function createMockSearchResponse(page = 1, limit = 20): SearchResponse {
  const safePage = Math.max(1, page)
  const safeLimit = Math.max(1, limit)
  const start = (safePage - 1) * safeLimit
  const end = start + safeLimit

  return {
    items: mockSearchResults.slice(start, end),
    page: safePage,
    limit: safeLimit,
    total: mockSearchResults.length,
  }
}
