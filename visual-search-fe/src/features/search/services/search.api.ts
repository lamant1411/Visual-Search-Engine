import { apiClient } from '@/lib/api/client'
import { createMockSearchResponse } from '@/mocks/searchMockData'

import type { ImageSearchParams, SearchResponse, TextSearchParams } from '../types'
import { mapSearchResponse } from './search.mapper'

const shouldUseMock = import.meta.env.VITE_ENABLE_MOCK !== 'false'

export async function searchByText(params: TextSearchParams): Promise<SearchResponse> {
  const page = params.page ?? 1
  const limit = params.limit ?? 20

  if (shouldUseMock) {
    return createMockSearchResponse(page, limit)
  }

  const endpoint = params.mode === 'ocr' ? '/search/ocr' : '/search/text'
  const { mode, ...apiParams } = params

  const response = await apiClient.get<unknown>(endpoint, {
    params: apiParams,
  })

  return mapSearchResponse(response.data, { page, limit })
}

export async function searchByImage({
  file,
  imageId,
  imageUrl,
  historyKey,
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

  if (historyKey) {
    formData.append('historyKey', historyKey)
  }

  formData.append('page', String(page))
  formData.append('limit', String(limit))

  const response = await apiClient.post<unknown>('/search/image', formData)

  return mapSearchResponse(response.data, { page, limit })
}
