import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { historyApi } from '@/lib/api/history'

export const HISTORY_PAGE_LIMIT = 20

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong while loading your search history.'
}

export function useHistory() {
  const historyQuery = useInfiniteQuery({
    queryKey: ['search-history-infinite'],
    queryFn: ({ pageParam = 1 }) =>
      historyApi.list({ page: pageParam as number, limit: HISTORY_PAGE_LIMIT }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((sum, page) => sum + page.items.length, 0)
      return loadedCount < lastPage.total ? allPages.length + 1 : undefined
    },
  })

  const items = useMemo(
    () => historyQuery.data?.pages.flatMap((page) => page.items) ?? [],
    [historyQuery.data],
  )

  const total = historyQuery.data?.pages[0]?.total ?? 0

  return {
    items,
    total,
    isLoading: historyQuery.isLoading,
    isFetching: historyQuery.isFetching,
    isFetchingNextPage: historyQuery.isFetchingNextPage,
    hasNextPage: historyQuery.hasNextPage,
    fetchNextPage: historyQuery.fetchNextPage,
    error: historyQuery.error ? getErrorMessage(historyQuery.error) : null,
    refetch: historyQuery.refetch,
  }
}
