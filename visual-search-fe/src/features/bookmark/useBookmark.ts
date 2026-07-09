import { useState, useEffect, useCallback } from 'react'
import { bookmarkApi, type BookmarkItem } from '@/lib/api/bookmark'

export function useBookmark() {
  const [items, setItems] = useState<BookmarkItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removingIds, setRemovingIds] = useState<number[]>([])

  const fetchBookmarks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await bookmarkApi.list({ limit: 50 })
      setItems(res.items)
    } catch (err) {
      console.error('[useBookmark] Lỗi khi tải bookmark:', err)
      setError('Không thể tải danh sách bookmark. Vui lòng thử lại.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const removeItem = useCallback(async (id: number) => {
    setRemovingIds((prev) => [...prev, id])
    try {
      await bookmarkApi.remove(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      console.error('[useBookmark] Lỗi khi xoá bookmark:', err)
    } finally {
      setRemovingIds((prev) => prev.filter((rid) => rid !== id))
    }
  }, [])

  useEffect(() => {
    fetchBookmarks()
  }, [fetchBookmarks])

  return { items, isLoading, error, removingIds, removeItem, refetch: fetchBookmarks }
}
