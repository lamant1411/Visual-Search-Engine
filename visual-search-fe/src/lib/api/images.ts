import type { SearchResponse } from '@/features/search/types'
import type { PaginationParams } from './types'
import { apiClient } from './client'

export type ImageLibraryParams = PaginationParams & {
  q?: string
}

export type ImageDeleteResponse = {
  image_id: number
  deleted: boolean
  file_deleted: boolean
  qdrant_deleted: boolean
}

export type ImageRestoreResponse = {
  image_id: number
  restored: boolean
  status: string
}

export type ImageBulkDeleteFailedItem = {
  image_id: number
  code: string
  message: string
}

export type ImageBulkDeleteResponse = {
  deleted_items: ImageDeleteResponse[]
  failed_items: ImageBulkDeleteFailedItem[]
  deleted_count: number
  failed_count: number
}

export type ImageBulkRestoreResponse = {
  restored_items: ImageRestoreResponse[]
  failed_items: ImageBulkDeleteFailedItem[]
  restored_count: number
  failed_count: number
}

export const imageLibraryApi = {
  async list(params?: ImageLibraryParams): Promise<SearchResponse> {
    const response = await apiClient.get<SearchResponse>('/images', { params })
    return response.data
  },

  async listDeleted(params?: ImageLibraryParams): Promise<SearchResponse> {
    const response = await apiClient.get<SearchResponse>('/images/deleted', { params })
    return response.data
  },

  async delete(imageId: number): Promise<ImageDeleteResponse> {
    const response = await apiClient.delete<ImageDeleteResponse>(`/images/${imageId}`)
    return response.data
  },

  async bulkDelete(imageIds: number[]): Promise<ImageBulkDeleteResponse> {
    const response = await apiClient.post<ImageBulkDeleteResponse>('/images/bulk-delete', {
      image_ids: imageIds,
    })
    return response.data
  },

  async restore(imageId: number): Promise<ImageRestoreResponse> {
    const response = await apiClient.post<ImageRestoreResponse>(`/images/${imageId}/restore`)
    return response.data
  },

  async bulkRestore(imageIds: number[]): Promise<ImageBulkRestoreResponse> {
    const response = await apiClient.post<ImageBulkRestoreResponse>('/images/bulk-restore', {
      image_ids: imageIds,
    })
    return response.data
  },

  async permanentDelete(imageId: number): Promise<ImageDeleteResponse> {
    const response = await apiClient.delete<ImageDeleteResponse>(`/images/${imageId}/permanent`)
    return response.data
  },

  async bulkPermanentDelete(imageIds: number[]): Promise<ImageBulkDeleteResponse> {
    const response = await apiClient.post<ImageBulkDeleteResponse>('/images/bulk-permanent-delete', {
      image_ids: imageIds,
    })
    return response.data
  },
}