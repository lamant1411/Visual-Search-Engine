import { apiClient } from '@/lib/api/client'
import { createMockSearchResponse } from '@/mocks/searchMockData'

import type { ImageSearchParams, SearchResponse, TextSearchParams } from '../types'

const shouldUseMock = import.meta.env.VITE_ENABLE_MOCK !== 'false'

export async function searchByText(params: TextSearchParams): Promise<SearchResponse> {
  if (shouldUseMock) {
    return createMockSearchResponse(params.page, params.limit)
  }

  const endpoint = params.mode === 'ocr' ? '/search/ocr' : '/search/text'
  const { mode, ...apiParams } = params

  const response = await apiClient.get<SearchResponse>(endpoint, {
    params: apiParams,
  })

  return response.data
}

export async function searchByImage({
  file,
  imageId,
  imageUrl,
  page = 1,
  limit = 20,
}: ImageSearchParams): Promise<SearchResponse> {
  if (shouldUseMock) {
    return createMockSearchResponse(page, limit)
  }

  if (!file && !imageId && !imageUrl) {
    throw new Error('Image search requires file, imageId, or imageUrl.')
  }

  const formData = new FormData()
  if (file) {
    formData.append('file', file)
  }

  if (imageId !== undefined) {
    formData.append('image_id', String(imageId))
  }

  if (imageUrl) {
    formData.append('imageUrl', imageUrl)
  }

  formData.append('page', String(page))
  formData.append('limit', String(limit))

  const response = await apiClient.post<SearchResponse>('/search/image', formData)

  return response.data
}
