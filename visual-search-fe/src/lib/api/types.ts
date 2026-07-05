export type ApiErrorCode =
  | 'BAD_REQUEST'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'SERVER_ERROR'

export type ApiErrorResponse = {
  code: ApiErrorCode
  message: string
  details?: Record<string, unknown>
}

export type PaginationParams = {
  page?: number
  limit?: number
}

export type PaginatedResponse<TItem> = {
  items: TItem[]
  page: number
  limit: number
  total: number
}
