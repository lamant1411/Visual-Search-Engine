import { apiClient } from '@/lib/api/client'

import { mockSearchResponse } from '../mockData'
import type { ImageSearchParams, SearchResponse, TextSearchParams } from '../types'

const shouldUseMock = import.meta.env.VITE_ENABLE_MOCK === 'true'

export async function searchByText(params: TextSearchParams): Promise<SearchResponse> {
  if (shouldUseMock) {
    return mockSearchResponse
  }

  const response = await apiClient.get<SearchResponse>('/search/text', { params })
  return response.data
}

export async function searchByImage({
  file,
  page = 1,
  limit = 20,
}: ImageSearchParams): Promise<SearchResponse> {
  if (shouldUseMock) {
    return mockSearchResponse
  }

  const formData = new FormData()
  formData.append('file', file)
  formData.append('page', String(page))
  formData.append('limit', String(limit))

  const response = await apiClient.post<SearchResponse>('/search/image', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  })

  return response.data
}
