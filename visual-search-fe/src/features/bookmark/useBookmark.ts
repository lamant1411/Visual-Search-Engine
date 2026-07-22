import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { bookmarkApi, type BookmarkListResponse } from '@/lib/api/bookmark'
import { bookmarkKeys } from '@/features/search/hooks/useBookmarks'

export const BOOKMARK_PAGE_LIMIT = 20

export function useBookmark(page = 1) {
  const queryClient = useQueryClient()
  const listKey = bookmarkKeys.list(page, BOOKMARK_PAGE_LIMIT)
  const listQuery = useQuery({
    queryKey: listKey,
    queryFn: () => bookmarkApi.list({ page, limit: BOOKMARK_PAGE_LIMIT }),
  })
  const removeMutation = useMutation({
    mutationFn: bookmarkApi.remove,
    onMutate: async (imageId) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: listKey }),
        queryClient.cancelQueries({ queryKey: bookmarkKeys.imageIds }),
      ])
      const previousList = queryClient.getQueryData<BookmarkListResponse>(listKey)
      const previousIds = queryClient.getQueryData<number[]>(bookmarkKeys.imageIds) ?? []

      queryClient.setQueryData<BookmarkListResponse>(listKey, (currentList) =>
        currentList
          ? {
              ...currentList,
              items: currentList.items.filter((item) => item.imageId !== imageId),
              total: Math.max(0, currentList.total - 1),
            }
          : currentList,
      )
      queryClient.setQueryData<number[]>(bookmarkKeys.imageIds, (currentIds = []) =>
        currentIds.filter((id) => id !== imageId),
      )

      return { previousList, previousIds }
    },
    onError: (_error, _imageId, context) => {
      queryClient.setQueryData(listKey, context?.previousList)
      queryClient.setQueryData(bookmarkKeys.imageIds, context?.previousIds ?? [])
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.all })
    },
  })

  const total = listQuery.data?.total ?? 0

  return {
    items: listQuery.data?.items ?? [],
    total,
    totalPages: Math.ceil(total / BOOKMARK_PAGE_LIMIT),
    isLoading: listQuery.isLoading,
    error: listQuery.error ?? removeMutation.error,
    removingImageId: removeMutation.isPending ? removeMutation.variables : null,
    removeItem: removeMutation.mutate,
    refetch: listQuery.refetch,
  }
}
