import type { PaginatedResponse } from './types'
import { apiClient } from './client'

export interface AdminStats {
  total_images: number
  total_users: number
}

export interface AdminUser {
  id: number
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

export interface AdminIndexUploadResponse {
  batch_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  total_images: number
  uploaded_files: number
}

export interface AdminIndexStartResponse {
  batch_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  total_images: number
}

export interface AdminIndexStatusResponse {
  batch_id: string
  status: 'queued' | 'running' | 'completed' | 'failed'
  total_images: number
  processed_images: number
  failed_images: number
  error_message?: string | null
}

export interface PendingImage {
  id: string
  url: string
  filename: string
  status: 'pending' | 'indexed' | 'failed' | 'saved_failed'
  created_at: string
}

// Danh sách người dùng giả lập
let mockUsers: AdminUser[] = [
  { id: 1, email: 'admin@example.com', role: 'admin', is_active: true, created_at: '2026-07-01T10:00:00Z' },
  { id: 2, email: 'user@example.com', role: 'user', is_active: true, created_at: '2026-07-02T14:30:00Z' },
  { id: 3, email: 'nguyenvana@gmail.com', role: 'user', is_active: true, created_at: '2026-07-05T08:20:00Z' },
  { id: 4, email: 'tranvib@yahoo.com', role: 'user', is_active: false, created_at: '2026-07-06T11:15:00Z' },
  { id: 5, email: 'lethic@outlook.com', role: 'user', is_active: true, created_at: '2026-07-08T09:40:00Z' },
  { id: 6, email: 'phamd@company.vn', role: 'user', is_active: true, created_at: '2026-07-09T16:00:00Z' },
]

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const adminApi = {
  /**
   * Lấy số liệu thống kê Dashboard
   */
  async getStats(): Promise<AdminStats> {
    const response = await apiClient.get<AdminStats>('/admin/dashboard')
    return response.data
  },

  /**
   * Lấy danh sách Users (Mock fallback vì backend chưa có endpoint riêng này)
   */
  async listUsers(params?: { page?: number; limit?: number }): Promise<PaginatedResponse<AdminUser>> {
    try {
      const response = await apiClient.get<PaginatedResponse<AdminUser>>('/admin/users', { params })
      return response.data
    } catch {
      await delay(300)
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
    const response = await apiClient.get<{ items: IndexingBatch[] }>('/admin/index/batches')
    return response.data.items
  },

  /**
   * Lấy trạng thái Indexing tổng quát (hỗ trợ polling)
   */
  async getIndexingStatus(): Promise<IndexingStatus> {
    const response = await apiClient.get<{ items: IndexingBatch[] }>('/admin/index/batches')
    const latest = response.data.items[0]
    if (!latest) {
      return { status: 'idle', progress: 0, processed_count: 0, total_count: 0 }
    }
    return {
      status: latest.status as any,
      progress: latest.total_images > 0 ? Math.round((latest.processed_images / latest.total_images) * 100) : 0,
      processed_count: latest.processed_images,
      total_count: latest.total_images,
      error_message: latest.error_message
    }
  },

  /**
   * Tải ảnh hàng loạt lên server (Tạo Batch ở trạng thái queued)
   * Giới hạn: File <= 2MB, Batch <= 100MB
   */
  async uploadBatchImages(
    files: File[],
    onProgress?: (percent: number) => void
  ): Promise<AdminIndexUploadResponse> {
    const MAX_FILE_SIZE = 2 * 1024 * 1024 // 2MB
    const MAX_BATCH_SIZE = 100 * 1024 * 1024 // 100MB

    let totalBatchSize = 0
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`Ảnh "${file.name}" vượt quá kích thước tối đa cho phép là 2MB.`)
      }
      totalBatchSize += file.size
    }

    if (totalBatchSize > MAX_BATCH_SIZE) {
      throw new Error(
        `Tổng dung lượng các ảnh (${(totalBatchSize / (1024 * 1024)).toFixed(2)}MB) vượt quá giới hạn mỗi lượt là 100MB.`
      )
    }

    const formData = new FormData()
    files.forEach((file) => {
      formData.append('files', file)
    })

    const response = await apiClient.post<AdminIndexUploadResponse>(
      '/admin/index/upload',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total && onProgress) {
            const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total)
            onProgress(percent)
          }
        }
      }
    )
    return response.data
  },

  /**
   * Kích hoạt tiến trình Indexing cho một batch đã upload trên Server
   */
  async startBatchIndexing(batchId: string): Promise<AdminIndexStartResponse> {
    const response = await apiClient.post<AdminIndexStartResponse>(`/admin/index/${batchId}/start`)
    return response.data
  },

  /**
   * Lấy trạng thái chi tiết của một batch
   */
  async getBatchStatus(batchId: string): Promise<AdminIndexStatusResponse> {
    const response = await apiClient.get<AdminIndexStatusResponse>(`/admin/index/status/${batchId}`)
    return response.data
  },

  /**
   * Tác vụ với ảnh đơn trong modal lỗi (Xử lý cục bộ trên giao diện)
   */
  async indexSingleImage(_url: string): Promise<{ success: boolean; error_message?: string }> {
    await delay(600)
    const isFailed = Math.random() < 0.15
    if (isFailed) {
      return {
        success: false,
        error_message: 'Thử lại thất bại: Lỗi trích xuất vector hoặc ảnh lỗi.'
      }
    }
    return { success: true }
  },

  async deletePendingImage(_url: string): Promise<{ success: boolean }> {
    await delay(100)
    return { success: true }
  },

  async saveFailedImage(_url: string): Promise<{ success: boolean }> {
    await delay(100)
    return { success: true }
  },

  // --- Stubs cho các phương thức legacy không sử dụng ---
  async triggerIndexing(_batchSize: number = 500): Promise<TriggerIndexingResponse> {
    return { message: 'Legacy trigger stub called', task_id: 'legacy' }
  },

  async uploadImageToServer(file: File): Promise<{ url: string; filename: string }> {
    return { url: '', filename: file.name }
  },

  async getPendingImages(): Promise<PendingImage[]> {
    return []
  },

  async triggerIndexingForUrls(_urls: string[]): Promise<TriggerIndexingResponse> {
    return { message: `Legacy stub index ${_urls.length} urls`, task_id: 'legacy' }
  },
}

