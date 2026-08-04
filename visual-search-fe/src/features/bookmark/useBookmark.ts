import { useMemo } from 'react'
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'

import { bookmarkApi, type BookmarkListResponse } from '@/lib/api/bookmark'
import { bookmarkKeys } from '@/features/search/hooks/useBookmarks'

export const BOOKMARK_PAGE_LIMIT = 20

export function useBookmark() {
  const queryClient = useQueryClient()
  const infiniteQueryKey = ['bookmarks-infinite'] as const

  const listQuery = useInfiniteQuery({
    queryKey: infiniteQueryKey,
    queryFn: ({ pageParam = 1 }) =>
      bookmarkApi.list({ page: pageParam as number, limit: BOOKMARK_PAGE_LIMIT }),
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((sum, page) => sum + page.items.length, 0)
      if (lastPage.items.length < BOOKMARK_PAGE_LIMIT || loadedCount >= lastPage.total) {
        return undefined
      }
      return allPages.length + 1
    },
  })

  const removeMutation = useMutation({
    mutationFn: bookmarkApi.remove,
    onMutate: async (imageId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: infiniteQueryKey }),
        queryClient.cancelQueries({ queryKey: bookmarkKeys.imageIds }),
      ])
      const previousInfinite =
        queryClient.getQueryData<InfiniteData<BookmarkListResponse>>(infiniteQueryKey)
      const previousIds = queryClient.getQueryData<number[]>(bookmarkKeys.imageIds) ?? []

      queryClient.setQueryData<InfiniteData<BookmarkListResponse>>(infiniteQueryKey, (old) => {
        if (!old) return old
        return {
          ...old,
          pages: old.pages.map((page) => ({
            ...page,
            items: page.items.filter((item) => item.imageId !== imageId),
            total: Math.max(0, page.total - 1),
          })),
        }
      })
      queryClient.setQueryData<number[]>(bookmarkKeys.imageIds, (currentIds = []) =>
        currentIds.filter((id) => id !== imageId),
      )

      return { previousInfinite, previousIds }
    },
    onError: (_error, _imageId, context) => {
      queryClient.setQueryData(infiniteQueryKey, context?.previousInfinite)
      queryClient.setQueryData(bookmarkKeys.imageIds, context?.previousIds ?? [])
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: infiniteQueryKey })
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.all })
    },
  })

  const restoreMutation = useMutation({
    mutationFn: bookmarkApi.save,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: infiniteQueryKey })
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.all })
    },
  })

  const items = useMemo(() => {
    const seenIds = new Set<number>()
    return (listQuery.data?.pages ?? [])
      .flatMap((page) => page.items)
      .filter((item) => {
        if (seenIds.has(item.imageId)) {
          return false
        }
        seenIds.add(item.imageId)
        return true
      })
  }, [listQuery.data])

  const total = listQuery.data?.pages[0]?.total ?? 0

  return {
    items,
    total,
    isLoading: listQuery.isLoading,
    isFetchingNextPage: listQuery.isFetchingNextPage,
    isFetchNextPageError: listQuery.isFetchNextPageError,
    hasNextPage: listQuery.hasNextPage,
    fetchNextPage: listQuery.fetchNextPage,
    error: listQuery.error ?? removeMutation.error,
    removingImageId: removeMutation.isPending ? removeMutation.variables : null,
    restoringImageId: restoreMutation.isPending ? restoreMutation.variables : null,
    removeItem: removeMutation.mutate,
    restoreItem: restoreMutation.mutate,
    refetch: listQuery.refetch,
  }
}
