import type { SearchResult, SearchResponse } from '@/features/search/types'

const baseMockSearchResults: SearchResult[] = [
  {
    id: 1,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=640&q=80',
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
      'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=640&q=80',
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
      'https://images.unsplash.com/photo-1522202176988-66273c2fd55f?auto=format&fit=crop&w=640&q=80',
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
  {
    id: 4,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=640&q=80',
    imageUrl:
      'https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1400&q=80',
    similarityScore: 91.6,
    metadata: {
      width: 1400,
      height: 933,
      source: 'Unsplash',
    },
  },
  {
    id: 5,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=640&q=80',
    imageUrl:
      'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=1200&q=80',
    similarityScore: 87.9,
    metadata: {
      width: 1200,
      height: 1500,
      source: 'Unsplash',
    },
  },
  {
    id: 6,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=640&q=80',
    imageUrl:
      'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1400&q=80',
    similarityScore: 86.4,
    metadata: {
      width: 1400,
      height: 933,
      source: 'Unsplash',
      ocrText: 'NIGHT SKY',
    },
  },
  {
    id: 7,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1483058712412-4245e9b90334?auto=format&fit=crop&w=640&q=80',
    imageUrl:
      'https://images.unsplash.com/photo-1483058712412-4245e9b90334?auto=format&fit=crop&w=1400&q=80',
    similarityScore: 83.2,
    metadata: {
      width: 1400,
      height: 934,
      source: 'Unsplash',
      ocrText: 'DESK',
    },
  },
  {
    id: 8,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=640&q=80',
    imageUrl:
      'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=1200&q=80',
    similarityScore: 80.8,
    metadata: {
      width: 1200,
      height: 1500,
      source: 'Unsplash',
    },
  },
  {
    id: 9,
    thumbnailUrl:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=640&q=80',
    imageUrl:
      'https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=1400&q=80',
    similarityScore: 78.5,
    metadata: {
      width: 1400,
      height: 933,
      source: 'Unsplash',
      ocrText: 'CIRCUIT',
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
