import { useQuery } from '@tanstack/react-query'
import { historyApi } from '@/lib/api/history'

const historyQueryKey = ['search-history'] as const

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong while loading your search history.'
}

export function useHistory() {
  const historyQuery = useQuery({
    queryKey: historyQueryKey,
    queryFn: () => historyApi.list({ page: 1, limit: 100 }),
  })

  return {
    items: historyQuery.data?.items ?? [],
    total: historyQuery.data?.total ?? 0,
    isLoading: historyQuery.isLoading,
    isFetching: historyQuery.isFetching,
    error: historyQuery.error ? getErrorMessage(historyQuery.error) : null,
    refetch: historyQuery.refetch,
  }
}
