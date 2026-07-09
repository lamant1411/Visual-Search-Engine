import { useState, useEffect, useCallback } from 'react'
import { bookmarkApi, type BookmarkItem } from '@/lib/api/bookmark'

const LIMIT = 20

export function useBookmark(page: number = 1) {
  const [items, setItems] = useState<BookmarkItem[]>([])
  const [total, setTotal] = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [removingIds, setRemovingIds] = useState<number[]>([])

  const fetchBookmarks = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await bookmarkApi.list({ page, limit: LIMIT })
      setItems(res.items)
      setTotal(res.total)
    } catch (err) {
      console.error('[useBookmark] Lỗi khi tải bookmark:', err)
      setError('Không thể tải danh sách bookmark. Vui lòng thử lại.')
    } finally {
      setIsLoading(false)
    }
  }, [page])

  const removeItem = useCallback(async (id: number) => {
    setRemovingIds((prev) => [...prev, id])
    try {
      await bookmarkApi.remove(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
      setTotal((prev) => prev - 1)
    } catch (err) {
      console.error('[useBookmark] Lỗi khi xoá bookmark:', err)
    } finally {
      setRemovingIds((prev) => prev.filter((rid) => rid !== id))
    }
  }, [])

  useEffect(() => {
    fetchBookmarks()
  }, [fetchBookmarks])

  return {
    items,
    total,
    totalPages: Math.ceil(total / LIMIT),
    isLoading,
    error,
    removingIds,
    removeItem,
    refetch: fetchBookmarks,
  }
}

