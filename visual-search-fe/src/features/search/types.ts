export type SearchMode = 'image' | 'text'

export type ImageMetadata = {
  width: number | null
  height: number | null
  source?: string
  ocrText?: string
}

export type SearchResult = {
  id: number
  thumbnailUrl: string
  imageUrl: string
  similarityScore: number
  metadata: ImageMetadata
}

export type SearchResponse = {
  items: SearchResult[]
  page: number
  limit: number
  total: number
}

export type TextSearchParams = {
  q: string
  page?: number
  limit?: number
}

export type ImageSearchParams = {
  file?: File
  imageId?: number
  imageUrl?: string
  historyKey?: string
  page?: number
  limit?: number
}
