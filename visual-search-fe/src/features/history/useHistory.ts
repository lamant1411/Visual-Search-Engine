import { useState, useEffect, useCallback } from 'react'
import { historyApi, type HistoryItem } from '@/lib/api/history'

export function useHistory() {
  const [items, setItems] = useState<HistoryItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<number[]>([])
  const [isDeletingAll, setIsDeletingAll] = useState(false)

  // Nạp dữ liệu từ API giả lập
  const fetchHistory = useCallback(async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await historyApi.list({ limit: 50 })
      setItems(response.items)
    } catch (err) {
      console.error('[useHistory] Lỗi khi nạp lịch sử:', err)
      setError('Không thể tải lịch sử tìm kiếm. Vui lòng thử lại.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Xóa một dòng lịch sử
  const deleteItem = useCallback(async (id: number) => {
    setDeletingIds((prev) => [...prev, id])
    try {
      await historyApi.delete(id)
      setItems((prev) => prev.filter((item) => item.id !== id))
    } catch (err) {
      console.error('[useHistory] Lỗi khi xóa mục:', err)
      alert('Không thể xóa mục lịch sử này. Vui lòng thử lại.')
    } finally {
      setDeletingIds((prev) => prev.filter((deletingId) => deletingId !== id))
    }
  }, [])

  // Xóa toàn bộ lịch sử
  const deleteAll = useCallback(async () => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa toàn bộ lịch sử tìm kiếm?')) {
      return
    }
    setIsDeletingAll(true)
    try {
      await historyApi.deleteAll()
      setItems([])
    } catch (err) {
      console.error('[useHistory] Lỗi khi xóa tất cả:', err)
      alert('Không thể xóa toàn bộ lịch sử. Vui lòng thử lại.')
    } finally {
      setIsDeletingAll(false)
    }
  }, [])

  // Xóa nhiều dòng lịch sử
  const deleteMultiple = useCallback(async (ids: number[]) => {
    setDeletingIds((prev) => [...prev, ...ids])
    try {
      await historyApi.deleteMultiple(ids)
      setItems((prev) => prev.filter((item) => !ids.includes(item.id)))
    } catch (err) {
      console.error('[useHistory] Lỗi khi xóa nhiều mục:', err)
      alert('Không thể xóa các mục được chọn. Vui lòng thử lại.')
    } finally {
      setDeletingIds((prev) => prev.filter((deletingId) => !ids.includes(deletingId)))
    }
  }, [])

  useEffect(() => {
    fetchHistory()
  }, [fetchHistory])

  return {
    items,
    isLoading,
    error,
    deletingIds,
    isDeletingAll,
    deleteItem,
    deleteAll,
    deleteMultiple,
    refetch: fetchHistory,
  }
}
