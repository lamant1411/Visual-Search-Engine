import type { PaginatedResponse } from './types'
import { apiClient } from './client'

export interface AdminStats {
  total_images: number
  indexed_images: number
  pending_images: number
  failed_images: number
  total_users: number
  latest_batches: IndexingBatch[]
}

export interface AdminUser {
  id: number
  email: string
  username?: string
  full_name?: string
  role: 'admin' | 'user'
  is_active: boolean
  created_at: string
  updated_at?: string | null
  last_login_at?: string | null
}


export interface AdminImage {
  id: number
  image_url: string
  storage_path: string
  filename: string
  source_type: 'dataset' | 'upload'
  status: 'pending' | 'indexed' | 'failed'
  mime_type?: string | null
  file_size?: number | null
  width?: number | null
  height?: number | null
  created_at: string
  updated_at?: string | null
}

export interface AdminImageDeleteResponse {
  image_id: number
  deleted: boolean
  file_deleted: boolean
  qdrant_deleted: boolean
}

export interface IndexingStatus {
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  progress: number // 0 to 100
  processed_count: number
  total_count: number
  error_message?: string | null
}

export interface IndexingBatch {
  id: number
  batch_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_images: number
  processed_images: number
  failed_images: number
  ocr_processed_images: number
  ocr_failed_images: number
  error_message?: string | null
  is_uploading: boolean
  upload_started_at?: string | null
  upload_completed_at?: string | null
  semantic_started_at?: string | null
  semantic_completed_at?: string | null
  ocr_started_at?: string | null
  ocr_completed_at?: string | null
  created_at: string
  updated_at?: string | null
}

export interface TriggerIndexingResponse {
  message: string
  task_id: string
}

export interface AdminIndexUploadResponse {
  batch_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_images: number
  uploaded_files: number
}

export interface AdminIndexStartResponse {
  batch_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_images: number
}

export interface AdminIndexStatusResponse {
  batch_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_images: number
  processed_images: number
  failed_images: number
  queued_images: number
  running_images: number
  ocr_processed_images: number
  ocr_failed_images: number
  ocr_queued_images: number
  ocr_running_images: number
  is_uploading: boolean
  error_message?: string | null
  created_at?: string | null
  upload_started_at?: string | null
  upload_completed_at?: string | null
  semantic_started_at?: string | null
  semantic_completed_at?: string | null
  ocr_started_at?: string | null
  ocr_completed_at?: string | null
}

export interface AdminBatchCreateResponse {
  batch_id: string
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled'
  total_images: number
  processed_images: number
  failed_images: number
  ocr_processed_images: number
  ocr_failed_images: number
  is_uploading: boolean
  upload_started_at?: string | null
}

export interface AdminBatchImageUploadResponse {
  batch_id: string
  uploaded_files: number
  total_images: number
  queued_items: number
  skipped_files: number
}
export interface AdminIndexRetryItemsResponse {
  batch_id: string
  queued_items: number
  retried_item_ids: number[]
}



export interface AdminIndexingItem {
  id: number
  batch_id: string
  image_id: number
  image_url: string
  storage_path: string
  filename: string
  status: 'queued' | 'running' | 'indexed' | 'failed' | 'cancelled'
  retry_count: number
  max_retries: number
  error_message?: string | null
  ocr_status: 'queued' | 'running' | 'indexed' | 'failed' | 'cancelled'
  ocr_retry_count: number
  ocr_error_message?: string | null
  semantic_started_at?: string | null
  semantic_completed_at?: string | null
  ocr_started_at?: string | null
  ocr_completed_at?: string | null
  created_at: string
  updated_at?: string | null
}


export interface PendingImage {
  id: string
  url: string
  filename: string
  status: 'pending' | 'indexed' | 'failed' | 'saved_failed'
  created_at: string
}

export const adminApi = {
  /**
   * Lấy số liệu thống kê Dashboard
   */
  async getStats(): Promise<AdminStats> {
    const response = await apiClient.get<AdminStats>('/admin/dashboard')
    return response.data
  },

  /**
   * Lấy danh sách Users từ backend
   */
  async listUsers(params?: { page?: number; limit?: number }): Promise<PaginatedResponse<AdminUser>> {
    const response = await apiClient.get<PaginatedResponse<AdminUser>>('/admin/users', { params })
    return response.data
  },

  /**
   * Lấy danh sách lịch sử các đợt Indexing
   */

  async listImages(params?: {
    page?: number
    limit?: number
    status?: AdminImage['status']
    q?: string
  }): Promise<PaginatedResponse<AdminImage>> {
    const response = await apiClient.get<PaginatedResponse<AdminImage>>(
      '/admin/images',
      { params }
    )
    return response.data
  },

  async deleteImage(imageId: number): Promise<AdminImageDeleteResponse> {
    const response = await apiClient.delete<AdminImageDeleteResponse>(`/admin/images/${imageId}`)
    return response.data
  },

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
      status: latest.status as IndexingStatus['status'],
      progress: latest.total_images > 0
        ? Math.round(((latest.processed_images + latest.failed_images) / latest.total_images) * 100)
        : 0,
      processed_count: latest.processed_images,
      total_count: latest.total_images,
      error_message: latest.error_message
    }
  },

  async createIndexingBatch(): Promise<AdminBatchCreateResponse> {
    const response = await apiClient.post<AdminBatchCreateResponse>('/admin/index/batches')
    return response.data
  },

  async uploadImagesToBatch(
    batchId: string,
    files: File[],
    onProgress?: (percent: number) => void,
    imageUrls?: string[]
  ): Promise<AdminBatchImageUploadResponse> {
    const formData = new FormData()
    files.forEach((file) => formData.append('files', file))
    imageUrls?.forEach((url) => formData.append('image_urls', url))

    const response = await apiClient.post<AdminBatchImageUploadResponse>(
      `/admin/index/batches/${batchId}/images`,
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (event) => {
          if (event.total && onProgress) {
            onProgress(Math.round((event.loaded * 100) / event.total))
          }
        },
      }
    )
    return response.data
  },

  async completeIndexingBatch(batchId: string): Promise<void> {
    await apiClient.post(`/admin/index/batches/${batchId}/complete-upload`)
  },

  async cancelIndexingBatch(batchId: string): Promise<AdminIndexStatusResponse> {
    const response = await apiClient.post<AdminIndexStatusResponse>(
      `/admin/index/batches/${batchId}/cancel`
    )
    return response.data
  },

  /**
   * Tải ảnh hàng loạt lên server (Tạo Batch ở trạng thái queued)
   * Giới hạn: File <= 10MB, chunk/request <= 100MB
   */
  async uploadBatchImages(
    files: File[],
    onProgress?: (percent: number) => void
  ): Promise<AdminIndexUploadResponse> {
    const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB
    const MAX_BATCH_SIZE = 100 * 1024 * 1024 // 100MB

    let totalBatchSize = 0
    for (const file of files) {
      if (file.size > MAX_FILE_SIZE) {
        throw new Error(`Ảnh "${file.name}" vượt quá kích thước tối đa cho phép là 10MB.`)
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
        timeout: 20000,
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

  async listIndexingItems(
    batchId: string,
    params?: { status?: AdminIndexingItem['status']; page?: number; limit?: number }
  ): Promise<PaginatedResponse<AdminIndexingItem>> {
    const response = await apiClient.get<PaginatedResponse<AdminIndexingItem>>(
      `/admin/index/${batchId}/items`,
      { params }
    )
    return response.data
  },

  async retryFailedIndexingItems(
    batchId: string,
    itemIds?: number[]
  ): Promise<AdminIndexRetryItemsResponse> {
    const response = await apiClient.post<AdminIndexRetryItemsResponse>(
      `/admin/index/${batchId}/items/retry`,
      itemIds && itemIds.length > 0 ? { item_ids: itemIds } : {}
    )
    return response.data
  },

  /**
   * Thử lại toàn bộ tiến trình index cho batch lỗi thông qua endpoint backend sẵn có (/index/{batch_id}/start)
   */
  async retryFailedBatchItems(batchId: string): Promise<AdminIndexStartResponse> {
    return this.startBatchIndexing(batchId)
  },

  /**
   * Upload lai file thay the cho cac anh loi thong qua endpoint upload batch ban dau.
   */
  async uploadAndRetryFailedImages(
    batchId: string,
    imageUrls: string[],
    files: File[],
    onProgress?: (percent: number) => void
  ): Promise<{ success: boolean; queued_items: number; error_message?: string }> {
    const response = await this.uploadImagesToBatch(batchId, files, onProgress, imageUrls)
    return { success: true, queued_items: response.queued_items }
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async deletePendingImage(_url: string): Promise<{ success: boolean }> {
    return { success: true }
  },

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  async saveFailedImage(_url: string): Promise<{ success: boolean }> {
    return { success: true }
  },

  // --- Stubs cho các phương thức legacy không sử dụng ---
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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



