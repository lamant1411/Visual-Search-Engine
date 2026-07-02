import type { PaginatedResponse, PaginationParams } from '@/lib/api/types'

export type SearchMode = 'image' | 'semantic' | 'ocr'

export type TextSearchMode = Extract<SearchMode, 'semantic' | 'ocr'>

export type ImageMetadata = {
  width: number
  height: number
  source?: string
  ocrText?: string
}

export type SearchResult = {
  id: string
  thumbnailUrl: string
  imageUrl: string
  similarityScore: number
  metadata: ImageMetadata
}

export type SearchResponse = PaginatedResponse<SearchResult>

export type TextSearchParams = PaginationParams & {
  q: string
  mode: TextSearchMode
}

export type ImageSearchParams = PaginationParams & {
  file: File
}
