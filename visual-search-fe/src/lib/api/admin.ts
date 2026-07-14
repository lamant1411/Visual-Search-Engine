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
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed'
  progress: number // 0 to 100
  processed_count: number
  total_count: number
  error_message?: string | null
}

export interface IndexingBatch {
  id: number
  batch_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  total_images: number
  processed_images: number
  failed_images: number
  error_message?: string | null
  created_at: string
  updated_at?: string | null
}

export interface TriggerIndexingResponse {
  message: string
  task_id: string
}

// Giả lập danh sách các đợt Indexing trong localStorage
const INDEXING_STATE_KEY = 'mock_indexing_state'
const INDEXING_BATCHES_KEY = 'mock_indexing_batches'

const defaultBatches: IndexingBatch[] = [
  {
    id: 1,
    batch_id: 'batch_20260713_001',
    status: 'completed',
    total_images: 1200,
    processed_images: 1200,
    failed_images: 0,
    created_at: '2026-07-13T10:00:00.000Z',
    updated_at: '2026-07-13T10:15:30.000Z'
  },
  {
    id: 2,
    batch_id: 'batch_20260712_003',
    status: 'completed',
    total_images: 500,
    processed_images: 495,
    failed_images: 5,
    error_message: '5 ảnh lỗi định dạng không hỗ trợ',
    created_at: '2026-07-12T14:30:00.000Z',
    updated_at: '2026-07-12T14:38:12.000Z'
  },
  {
    id: 3,
    batch_id: 'batch_20260711_012',
    status: 'failed',
    total_images: 300,
    processed_images: 120,
    failed_images: 180,
    error_message: 'Mất kết nối với Vector Database',
    created_at: '2026-07-11T09:15:00.000Z',
    updated_at: '2026-07-11T09:20:45.000Z'
  }
]

function getStoredBatches(): IndexingBatch[] {
  const stored = localStorage.getItem(INDEXING_BATCHES_KEY)
  if (!stored) {
    localStorage.setItem(INDEXING_BATCHES_KEY, JSON.stringify(defaultBatches))
    return defaultBatches
  }
  try {
    return JSON.parse(stored) as IndexingBatch[]
  } catch {
    return defaultBatches
  }
}

function saveStoredBatches(batches: IndexingBatch[]) {
  localStorage.setItem(INDEXING_BATCHES_KEY, JSON.stringify(batches))
}

function getStoredIndexingState(): IndexingStatus {
  const stored = localStorage.getItem(INDEXING_STATE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as IndexingStatus
      // Nếu đang chạy, giả lập tăng tiến trình qua mỗi lần đọc (polling)
      if (parsed.status === 'running' || parsed.status === 'queued') {
        // Chuyển queued sang running nếu cần thiết
        if (parsed.status === 'queued') {
          parsed.status = 'running'
        }

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

          // Đồng bộ với danh sách đợt indexing lịch sử
          const batches = getStoredBatches()
          const activeBatch = batches.find(b => b.status === 'running' || b.status === 'queued')
          if (activeBatch) {
            activeBatch.status = parsed.status === 'completed' ? 'completed' : 'running'
            activeBatch.processed_images = parsed.processed_count
            activeBatch.updated_at = new Date().toISOString()
            saveStoredBatches(batches)
          }
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
      const response = await apiClient.get<AdminStats>('/admin/stats')
      return response.data
    } catch {
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
   * Lấy danh sách lịch sử các đợt Indexing
   */
  async getIndexingBatches(): Promise<IndexingBatch[]> {
    try {
      const response = await apiClient.get<IndexingBatch[]>('/admin/indexing/batches')
      return response.data
    } catch {
      await delay(300)
      // Kích hoạt cập nhật tiến độ (nếu có) trước khi trả về danh sách để hiển thị tiến độ đồng bộ
      getStoredIndexingState()
      return getStoredBatches()
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
      await delay(600)
      
      const currentState = getStoredIndexingState()
      if (currentState.status === 'running' || currentState.status === 'queued') {
        throw new Error('Tiến trình indexing hiện tại vẫn đang chạy. Vui lòng chờ.')
      }

      // 1. Tạo state indexing mới để chạy polling
      const newState: IndexingStatus = {
        status: 'running',
        progress: 0,
        processed_count: 0,
        total_count: batchSize,
      }
      setStoredIndexingState(newState)

      // 2. Thêm một đợt indexing mới vào danh sách lịch sử
      const batches = getStoredBatches()
      const newBatch: IndexingBatch = {
        id: batches.length + 1,
        batch_id: `batch_${new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14)}`,
        status: 'running',
        total_images: batchSize,
        processed_images: 0,
        failed_images: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      }
      batches.unshift(newBatch)
      saveStoredBatches(batches)

      return {
        message: `Đã kích hoạt indexing thành công cho batch gồm ${batchSize} ảnh.`,
        task_id: newBatch.batch_id,
      }
    }
  },

  /**
   * Tải ảnh lên trực tiếp chuẩn bị cho indexing
   */
  async uploadImagesForIndexing(files: File[]): Promise<{ message: string; uploaded_count: number }> {
    try {
      const formData = new FormData()
      files.forEach((file) => {
        formData.append('files', file)
      })
      const response = await apiClient.post<{ message: string; uploaded_count: number }>(
        '/admin/indexing/upload',
        formData,
        {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        }
      )
      return response.data
    } catch {
      await delay(800)
      return {
        message: `Tải lên thành công ${files.length} hình ảnh chuẩn bị indexing.`,
        uploaded_count: files.length,
      }
    }
  },
}
