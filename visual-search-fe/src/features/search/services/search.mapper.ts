import type { ImageMetadata, SearchResponse, SearchResult } from '../types'

type MappingDefaults = {
  page: number
  limit: number
}

export class SearchContractError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SearchContractError'
  }
}

export function mapSearchResponse(payload: unknown, defaults: MappingDefaults): SearchResponse {
  const response = asRecord(payload, 'Search response must be an object.')
  const rawItems = response.items ?? response.results

  if (!Array.isArray(rawItems)) {
    throw new SearchContractError('Search response must contain an items array.')
  }

  const items = rawItems.map((item, index) => mapSearchResult(item, index))

  return {
    items,
    page: readPositiveInteger(response.page, defaults.page),
    limit: readPositiveInteger(response.limit, defaults.limit),
    total: readNonNegativeInteger(response.total, items.length),
  }
}

function mapSearchResult(payload: unknown, index: number): SearchResult {
  const item = asRecord(payload, `Search item at index ${index} must be an object.`)
  const id = readPositiveInteger(item.id ?? item.image_id, 0)

  if (!id) {
    throw new SearchContractError(`Search item at index ${index} is missing a valid id.`)
  }

  const imageUrl = readString(item.imageUrl ?? item.image_url ?? item.storage_path)
  const thumbnailUrl = readString(item.thumbnailUrl ?? item.thumbnail_url) ?? imageUrl

  if (!imageUrl || !thumbnailUrl) {
    throw new SearchContractError(`Search item ${id} is missing an image URL.`)
  }

  return {
    id,
    thumbnailUrl,
    imageUrl,
    similarityScore: readNumber(item.similarityScore ?? item.similarity_score, 0),
    createdAt: readString(item.createdAt ?? item.created_at) ?? null,
    metadata: mapMetadata(item.metadata, item),
  }
}

function mapMetadata(payload: unknown, item: Record<string, unknown>): ImageMetadata {
  const metadata = isRecord(payload) ? payload : {}

  return {
    width: readNullableNumber(metadata.width ?? item.width),
    height: readNullableNumber(metadata.height ?? item.height),
    source: readString(metadata.source ?? item.source),
    ocrText: readString(metadata.ocrText ?? metadata.ocr_text ?? item.ocrText ?? item.ocr_text),
  }
}

function asRecord(value: unknown, errorMessage: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new SearchContractError(errorMessage)
  }

  return value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : undefined
}

function readNumber(value: unknown, fallback: number) {
  const parsedValue = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : fallback
}

function readNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const parsedValue = Number(value)
  return Number.isFinite(parsedValue) ? parsedValue : null
}

function readPositiveInteger(value: unknown, fallback: number) {
  const parsedValue = Number(value)
  return Number.isInteger(parsedValue) && parsedValue > 0 ? parsedValue : fallback
}

function readNonNegativeInteger(value: unknown, fallback: number) {
  const parsedValue = Number(value)
  return Number.isInteger(parsedValue) && parsedValue >= 0 ? parsedValue : fallback
}
