import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'

import { historyApi, type HistoryFilterType } from '@/lib/api/history'

export const HISTORY_PAGE_LIMIT = 20

const historyQueryKeys = {
  infiniteList: (limit: number, filter: HistoryFilterType) =>
    ['search-history', 'infinite-list', limit, filter] as const,
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : 'Something went wrong while loading your search history.'
}

export function useHistory(filter: HistoryFilterType = 'all', limit = HISTORY_PAGE_LIMIT) {
  const historyQuery = useInfiniteQuery({
    queryKey: historyQueryKeys.infiniteList(limit, filter),
    queryFn: ({ pageParam = 1 }) =>
      historyApi.list({
        page: pageParam as number,
        limit,
        query_type: filter === 'image' ? 'image' : undefined,
        query_group: filter === 'text' ? 'text' : undefined,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((sum, page) => sum + page.items.length, 0)
      if (lastPage.items.length < limit || loadedCount >= lastPage.total) {
        return undefined
      }

      return allPages.length + 1
    },
  })

  const items = useMemo(() => {
    const seenIds = new Set<number>()
    return (historyQuery.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((item) => {
        if (seenIds.has(item.id)) {
          return false
        }

        seenIds.add(item.id)
        return true
      })
  }, [historyQuery.data])

  const total = historyQuery.data?.pages[0]?.total ?? 0

  return {
    items,
    total,
    isLoading: historyQuery.isLoading,
    isFetching: historyQuery.isFetching,
    isFetchingNextPage: historyQuery.isFetchingNextPage,
    isFetchNextPageError: historyQuery.isFetchNextPageError,
    hasNextPage: historyQuery.hasNextPage,
    fetchNextPage: historyQuery.fetchNextPage,
    error: historyQuery.error ? getErrorMessage(historyQuery.error) : null,
    refetch: historyQuery.refetch,
  }
}
