import type { SearchResult, SearchResponse } from './types'

export const mockSearchResults: SearchResult[] = [
  {
    id: 'img-001',
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
    id: 'img-002',
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
    id: 'img-003',
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

export const mockSearchResponse: SearchResponse = {
  items: mockSearchResults,
  page: 1,
  limit: 20,
  total: mockSearchResults.length,
}
