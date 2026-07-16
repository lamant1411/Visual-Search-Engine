import { useCallback, useEffect, useState } from 'react'

const bookmarkStorageKey = 'visual-search-bookmarks'

export function useBookmarks() {
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<number>>(readBookmarks)

  useEffect(() => {
    localStorage.setItem(bookmarkStorageKey, JSON.stringify([...bookmarkedIds]))
  }, [bookmarkedIds])

  const toggleBookmark = useCallback((imageId: number) => {
    setBookmarkedIds((currentIds) => {
      const nextIds = new Set(currentIds)

      if (nextIds.has(imageId)) {
        nextIds.delete(imageId)
      } else {
        nextIds.add(imageId)
      }

      return nextIds
    })
  }, [])

  const isBookmarked = useCallback(
    (imageId: number) => bookmarkedIds.has(imageId),
    [bookmarkedIds],
  )

  return { isBookmarked, toggleBookmark }
}

function readBookmarks() {
  try {
    const storedValue = localStorage.getItem(bookmarkStorageKey)
    if (!storedValue) {
      return new Set<number>()
    }

    const parsedValue: unknown = JSON.parse(storedValue)
    if (!Array.isArray(parsedValue)) {
      return new Set<number>()
    }

    return new Set(parsedValue.filter((value): value is number => Number.isInteger(value) && value > 0))
  } catch {
    return new Set<number>()
  }
}
