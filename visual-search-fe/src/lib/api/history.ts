import { apiClient } from './client'
import type { PaginatedResponse } from './types'

export type SearchQueryType = 'image' | 'semantic' | 'ocr'

export interface HistoryItem {
  id: number
  query_type: SearchQueryType
  query_value: string
  query_image_url?: string
  created_at: string
}

interface HistoryApiItem {
  id: number
  queryType: SearchQueryType
  queryValue: string
  queryImageUrl?: string | null
  createdAt: string
}

interface HistoryApiResponse {
  items: HistoryApiItem[]
  page: number
  limit: number
  total: number
}

export interface HistoryListParams {
  page?: number
  limit?: number
}

function mapHistoryItem(item: HistoryApiItem): HistoryItem {
  return {
    id: item.id,
    query_type: item.queryType,
    query_value: item.queryValue,
    query_image_url: item.queryImageUrl ?? undefined,
    created_at: item.createdAt,
  }
}

export const historyApi = {
  async list(params?: HistoryListParams): Promise<PaginatedResponse<HistoryItem>> {
    const response = await apiClient.get<HistoryApiResponse>('/history', { params })
    return {
      ...response.data,
      items: response.data.items.map(mapHistoryItem),
    }
  },
}
