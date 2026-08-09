import { apiClient } from './client'
import type { PaginatedResponse, PaginationParams } from './types'

export type Album = {
  id: number
  name: string
  description?: string | null
  cover_image_id?: number | null
  cover_image_url?: string | null
  image_count: number
  created_at: string
  updated_at?: string | null
  deleted_at?: string | null
}

export type AlbumCreatePayload = {
  name: string
  description?: string | null
  cover_image_id?: number | null
}

export type AlbumUpdatePayload = Partial<AlbumCreatePayload>

export type AlbumImage = {
  id: number
  thumbnail_url: string
  image_url: string
  original_filename?: string | null
  status: 'pending' | 'indexed' | 'failed' | 'deleted'
  source_type: 'dataset' | 'upload'
  width?: number | null
  height?: number | null
  ocr_text?: string | null
  added_at: string
}

export type AlbumFailedImageItem = {
  image_id: number
  code: string
  message: string
}

export type AlbumImageChangeResponse = {
  album_id: number
  added_image_ids: number[]
  removed_image_ids: number[]
  failed_items: AlbumFailedImageItem[]
  added_count: number
  removed_count: number
  failed_count: number
}

export type AlbumDeleteResponse = {
  album_id: number
  deleted: boolean
}

export const albumsApi = {
  async list(params?: PaginationParams): Promise<PaginatedResponse<Album>> {
    const response = await apiClient.get<PaginatedResponse<Album>>('/albums', { params })
    return response.data
  },

  async listDeleted(params?: PaginationParams): Promise<PaginatedResponse<Album>> {
    const response = await apiClient.get<PaginatedResponse<Album>>('/albums/deleted', { params })
    return response.data
  },

  async create(payload: AlbumCreatePayload): Promise<Album> {
    const response = await apiClient.post<Album>('/albums', payload)
    return response.data
  },

  async get(albumId: number): Promise<Album> {
    const response = await apiClient.get<Album>(`/albums/${albumId}`)
    return response.data
  },

  async update(albumId: number, payload: AlbumUpdatePayload): Promise<Album> {
    const response = await apiClient.patch<Album>(`/albums/${albumId}`, payload)
    return response.data
  },

  async delete(albumId: number): Promise<AlbumDeleteResponse> {
    const response = await apiClient.delete<AlbumDeleteResponse>(`/albums/${albumId}`)
    return response.data
  },

  async restore(albumId: number): Promise<Album> {
    const response = await apiClient.post<Album>(`/albums/${albumId}/restore`)
    return response.data
  },

  async permanentDelete(albumId: number): Promise<AlbumDeleteResponse> {
    const response = await apiClient.delete<AlbumDeleteResponse>(`/albums/${albumId}/permanent`)
    return response.data
  },

  async listImages(albumId: number, params?: PaginationParams): Promise<PaginatedResponse<AlbumImage>> {
    const response = await apiClient.get<PaginatedResponse<AlbumImage>>(`/albums/${albumId}/images`, { params })
    return response.data
  },

  async addImages(albumId: number, imageIds: number[]): Promise<AlbumImageChangeResponse> {
    const response = await apiClient.post<AlbumImageChangeResponse>(`/albums/${albumId}/images/bulk-add`, {
      image_ids: imageIds,
    })
    return response.data
  },

  async removeImages(albumId: number, imageIds: number[]): Promise<AlbumImageChangeResponse> {
    const response = await apiClient.post<AlbumImageChangeResponse>(`/albums/${albumId}/images/bulk-remove`, {
      image_ids: imageIds,
    })
    return response.data
  },

  async removeImage(albumId: number, imageId: number): Promise<AlbumImageChangeResponse> {
    const response = await apiClient.delete<AlbumImageChangeResponse>(`/albums/${albumId}/images/${imageId}`)
    return response.data
  },
}
