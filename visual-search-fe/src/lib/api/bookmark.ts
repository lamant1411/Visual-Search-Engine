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
  image_ids: number[]
}

type BookmarkItemResponse = {
  id: number
  image_id: number
  image_url: string
  title: string
  saved_at: string
  width?: number | null
  height?: number | null
  source?: string | null
  ocr_text?: string | null
}

type BookmarkListApiResponse = {
  items: BookmarkItemResponse[]
  page: number
  limit: number
  total: number
}

function mapBookmark(item: BookmarkItemResponse): BookmarkItem {
  return {
    id: item.id,
    imageId: item.image_id,
    thumbnailUrl: item.image_url,
    imageUrl: item.image_url,
    savedAt: item.saved_at,
    metadata: {
      width: item.width ?? null,
      height: item.height ?? null,
      source: item.source ?? undefined,
      ocrText: item.ocr_text ?? undefined,
    },
  }
}

export const bookmarkApi = {
  list: (params?: BookmarkListParams) =>
    apiClient
      .get<BookmarkListApiResponse>('/bookmarks', { params })
      .then((response) => ({
        ...response.data,
        items: response.data.items.map(mapBookmark),
      })),

  imageIds: () =>
    apiClient
      .get<BookmarkImageIdsResponse>('/bookmarks/image-ids')
      .then((response) => response.data.image_ids),

  detail: (bookmarkId: number) =>
    apiClient
      .get<BookmarkItemResponse>(`/bookmarks/${bookmarkId}`)
      .then((response) => mapBookmark(response.data)),

  save: (imageId: number) =>
    apiClient
      .post<BookmarkItemResponse>('/bookmarks', { image_id: imageId })
      .then((response) => mapBookmark(response.data)),

  remove: (imageId: number) =>
    apiClient.delete(`/bookmarks/images/${imageId}`).then(() => undefined),
}
