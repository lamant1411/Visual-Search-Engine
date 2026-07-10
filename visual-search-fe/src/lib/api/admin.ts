import type { PaginatedResponse } from './types'
import { apiClient } from './client'

export interface AdminStats {
  total_images: number
  total_users: number
}

export interface AdminUser {
  id: string
  email: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
}

export interface IndexingStatus {
  status: 'idle' | 'running' | 'completed' | 'failed'
  progress: number // 0 to 100
  processed_count: number
  total_count: number
  error_message?: string | null
}

export interface TriggerIndexingResponse {
  message: string
  task_id: string
}

// Giả lập trạng thái Indexing trong localStorage để persistence giữa các lần reload/polling
const INDEXING_STATE_KEY = 'mock_indexing_state'

function getStoredIndexingState(): IndexingStatus {
  const stored = localStorage.getItem(INDEXING_STATE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as IndexingStatus
      // Nếu đang chạy, giả lập tăng tiến trình qua mỗi lần đọc (polling)
      if (parsed.status === 'running') {
        const timeElapsed = Date.now() - (parsed as any).lastUpdated
        // Giả sử hoàn thành 100% trong 25 giây (tương đương 4% mỗi giây)
        const progressIncrement = Math.floor((timeElapsed / 1000) * 4)
        if (progressIncrement > 0) {
          parsed.progress = Math.min(100, parsed.progress + progressIncrement)
          parsed.processed_count = Math.floor((parsed.total_count * parsed.progress) / 100)
          
          if (parsed.progress >= 100) {
            parsed.status = 'completed'
          }
          
          // Cập nhật lại mốc thời gian
          ;(parsed as any).lastUpdated = Date.now()
          localStorage.setItem(INDEXING_STATE_KEY, JSON.stringify(parsed))
        }
      }
      return parsed
    } catch {
      // ignore parsing error
    }
  }
  return {
    status: 'idle',
    progress: 0,
    processed_count: 0,
    total_count: 0,
  }
}

function setStoredIndexingState(state: IndexingStatus) {
  const stateWithTime = {
    ...state,
    lastUpdated: Date.now(),
  }
  localStorage.setItem(INDEXING_STATE_KEY, JSON.stringify(stateWithTime))
}

// Danh sách người dùng giả lập
let mockUsers: AdminUser[] = [
  { id: '1', email: 'admin@example.com', role: 'admin', is_active: true, created_at: '2026-07-01T10:00:00Z' },
  { id: '2', email: 'user@example.com', role: 'user', is_active: true, created_at: '2026-07-02T14:30:00Z' },
  { id: '3', email: 'nguyenvana@gmail.com', role: 'user', is_active: true, created_at: '2026-07-05T08:20:00Z' },
  { id: '4', email: 'tranvib@yahoo.com', role: 'user', is_active: false, created_at: '2026-07-06T11:15:00Z' },
  { id: '5', email: 'lethic@outlook.com', role: 'user', is_active: true, created_at: '2026-07-08T09:40:00Z' },
  { id: '6', email: 'phamd@company.vn', role: 'user', is_active: true, created_at: '2026-07-09T16:00:00Z' },
]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const adminApi = {
  /**
   * Lấy số liệu thống kê Dashboard
   */
  async getStats(): Promise<AdminStats> {
    try {
      // Thử gọi thật từ API nếu đã mở
      const response = await apiClient.get<AdminStats>('/admin/stats')
      return response.data
    } catch {
      // Fallback giả lập dữ liệu thống kê
      await delay(400)
      return {
        total_images: 12450,
        total_users: mockUsers.length,
      }
    }
  },

  /**
   * Lấy danh sách Users (Chỉ xem)
   */
  async listUsers(params?: { page?: number; limit?: number }): Promise<PaginatedResponse<AdminUser>> {
    try {
      const response = await apiClient.get<PaginatedResponse<AdminUser>>('/admin/users', { params })
      return response.data
    } catch {
      await delay(500)
      const page = params?.page ?? 1
      const limit = params?.limit ?? 10
      const start = (page - 1) * limit
      const items = mockUsers.slice(start, start + limit)
      return {
        items,
        page,
        limit,
        total: mockUsers.length,
      }
    }
  },

  /**
   * Lấy trạng thái Indexing (hỗ trợ polling)
   */
  async getIndexingStatus(): Promise<IndexingStatus> {
    try {
      const response = await apiClient.get<IndexingStatus>('/admin/indexing/status')
      return response.data
    } catch {
      // Giả lập trạng thái từ localStorage
      await delay(200)
      return getStoredIndexingState()
    }
  },

  /**
   * Kích hoạt tiến trình Indexing cho một batch ảnh mới
   */
  async triggerIndexing(batchSize: number = 500): Promise<TriggerIndexingResponse> {
    try {
      const response = await apiClient.post<TriggerIndexingResponse>('/admin/indexing/trigger', { batch_size: batchSize })
      return response.data
    } catch {
      // Giả lập kích hoạt tiến trình chạy ngầm
      await delay(600)
      
      const currentState = getStoredIndexingState()
      if (currentState.status === 'running') {
        throw new Error('Tiến trình indexing hiện tại vẫn đang chạy. Vui lòng chờ.')
      }

      const newState: IndexingStatus = {
        status: 'running',
        progress: 0,
        processed_count: 0,
        total_count: batchSize,
      }
      setStoredIndexingState(newState)

      return {
        message: `Đã kích hoạt indexing thành công cho batch gồm ${batchSize} ảnh.`,
        task_id: `task_${Date.now()}`,
      }
    }
  },
}
