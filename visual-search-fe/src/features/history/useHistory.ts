import { useQuery } from '@tanstack/react-query'

import { historyApi, type SearchQueryType } from '@/lib/api/history'

export const HISTORY_PAGE_LIMIT = 20

const historyQueryKeys = {
  list: (page: number, limit: number, queryType?: SearchQueryType) =>
    ['search-history', 'list', page, limit, queryType ?? 'all'] as const,
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong while loading your search history.'
}

export function useHistory(page = 1, queryType?: SearchQueryType, limit = HISTORY_PAGE_LIMIT) {
  const historyQuery = useQuery({
    queryKey: historyQueryKeys.list(page, limit, queryType),
    queryFn: () => historyApi.list({ page, limit, query_type: queryType }),
  })

  const total = historyQuery.data?.total ?? 0

  return {
    items: historyQuery.data?.items ?? [],
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    isLoading: historyQuery.isLoading,
    isFetching: historyQuery.isFetching,
    error: historyQuery.error ? getErrorMessage(historyQuery.error) : null,
    refetch: historyQuery.refetch,
  }
}
