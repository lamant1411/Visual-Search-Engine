import { useCallback, useMemo } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { useAuth } from '@/contexts/AuthContext'
import { bookmarkApi } from '@/lib/api/bookmark'

export const bookmarkKeys = {
  all: ['bookmarks'] as const,
  imageIds: ['bookmarks', 'image-ids'] as const,
  list: (page: number, limit: number) => ['bookmarks', 'list', page, limit] as const,
}

export function useBookmarks() {
  const { isAuthenticated } = useAuth()
  const queryClient = useQueryClient()
  const imageIdsQuery = useQuery({
    queryKey: bookmarkKeys.imageIds,
    queryFn: bookmarkApi.imageIds,
    enabled: isAuthenticated,
    staleTime: 30_000,
  })
  const bookmarkedIds = useMemo(() => new Set(imageIdsQuery.data ?? []), [imageIdsQuery.data])

  const toggleMutation = useMutation({
    mutationFn: async ({ imageId, shouldBookmark }: ToggleBookmarkInput) => {
      if (!shouldBookmark) {
        await bookmarkApi.remove(imageId)
        return
      }

      await bookmarkApi.save(imageId)
    },
    onMutate: async ({ imageId, shouldBookmark }) => {
      await queryClient.cancelQueries({ queryKey: bookmarkKeys.imageIds })
      const previousIds = queryClient.getQueryData<number[]>(bookmarkKeys.imageIds) ?? []
      const nextIds = shouldBookmark
        ? [...new Set([...previousIds, imageId])]
        : previousIds.filter((id) => id !== imageId)

      queryClient.setQueryData(bookmarkKeys.imageIds, nextIds)
      return { previousIds }
    },
    onError: (_error, _input, context) => {
      queryClient.setQueryData(bookmarkKeys.imageIds, context?.previousIds ?? [])
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: bookmarkKeys.all })
    },
  })

  const isBookmarked = useCallback(
    (imageId: number) => bookmarkedIds.has(imageId),
    [bookmarkedIds],
  )

  const toggleBookmark = useCallback(
    (imageId: number) => {
      if (isAuthenticated && !toggleMutation.isPending) {
        const currentIds = queryClient.getQueryData<number[]>(bookmarkKeys.imageIds) ?? []
        toggleMutation.mutate({
          imageId,
          shouldBookmark: !currentIds.includes(imageId),
        })
      }
    },
    [isAuthenticated, queryClient, toggleMutation],
  )

  return {
    isBookmarked,
    toggleBookmark,
    isLoading: imageIdsQuery.isLoading,
    isToggling: toggleMutation.isPending,
    error: imageIdsQuery.error ?? toggleMutation.error,
  }
}

type ToggleBookmarkInput = {
  imageId: number
  shouldBookmark: boolean
}
