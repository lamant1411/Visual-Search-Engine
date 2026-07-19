import { apiClient } from './client'

export type BookmarkMetadata = {
  width: number | null
  height: number | null
  source?: string
  ocrText?: string
}

export type BookmarkItem = {
  id: number
  imageId: number
  thumbnailUrl: string
  imageUrl: string
  savedAt: string
  metadata: BookmarkMetadata
}

export type BookmarkListResponse = {
  items: BookmarkItem[]
  page: number
  limit: number
  total: number
}

export type BookmarkListParams = {
  page?: number
  limit?: number
}

type BookmarkImageIdsResponse = {
  imageIds: number[]
}

export const bookmarkApi = {
  list: (params?: BookmarkListParams) =>
    apiClient
      .get<BookmarkListResponse>('/bookmarks', { params })
      .then((response) => response.data),

  imageIds: () =>
    apiClient
      .get<BookmarkImageIdsResponse>('/bookmarks/image-ids')
      .then((response) => response.data.imageIds),

  detail: (imageId: number) =>
    apiClient
      .get<BookmarkItem>(`/bookmarks/${imageId}`)
      .then((response) => response.data),

  save: (imageId: number) =>
    apiClient
      .put<BookmarkItem>(`/bookmarks/${imageId}`)
      .then((response) => response.data),

  remove: (imageId: number) =>
    apiClient.delete(`/bookmarks/${imageId}`).then(() => undefined),
}
