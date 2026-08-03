import { useEffect, useMemo, useState, useRef } from 'react'
import {
  Database,
  Loader2,
  CheckCircle2,
  XCircle,
  Upload,
  X,
  AlertTriangle,
  AlertCircle,
  Trash2,
  RefreshCw,
  Save,
  Clock,
  Info
} from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { adminApi, type IndexingBatch } from '@/lib/api/admin'

const INDEXING_POLL_INTERVAL_MS = 2_000
const BATCH_HISTORY_PAGE_LIMIT = 10

export default function AdminIndexingPage() {
  const [batches, setBatches] = useState<IndexingBatch[]>([])
  const [visibleBatchHistoryCount, setVisibleBatchHistoryCount] = useState(BATCH_HISTORY_PAGE_LIMIT)
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)

  // Direct upload files list
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isDragging, setIsDragging] = useState(false)

  // Upload progress states
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadedCount, setUploadedCount] = useState(0)
  const [totalUploadCount, setTotalUploadCount] = useState(0)
  const [uploadSuccess, setUploadSuccess] = useState(false)

  // Background indexing progress states
  const [isBackgroundIndexing, setIsBackgroundIndexing] = useState(false)
  const [indexProgress, setIndexProgress] = useState(0)
  const [indexedCount, setIndexedCount] = useState(0)
  const [failedIndexCount, setFailedIndexCount] = useState(0)
  const [totalIndexCount, setTotalIndexCount] = useState(0)
  const [queuedIndexCount, setQueuedIndexCount] = useState(0)
  const [runningIndexCount, setRunningIndexCount] = useState(0)
  const [ocrProcessedCount, setOcrProcessedCount] = useState(0)
  const [ocrFailedCount, setOcrFailedCount] = useState(0)
  const [ocrQueuedCount, setOcrQueuedCount] = useState(0)
  const [ocrRunningCount, setOcrRunningCount] = useState(0)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [uploadElapsedSeconds, setUploadElapsedSeconds] = useState(0)
  const [semanticElapsedSeconds, setSemanticElapsedSeconds] = useState(0)
  const [ocrElapsedSeconds, setOcrElapsedSeconds] = useState(0)
  const [semanticCompletedAt, setSemanticCompletedAt] = useState<number | null>(null)
  const [stalledSeconds, setStalledSeconds] = useState(0)
  const [activeBatchId, setActiveBatchId] = useState<string | null>(null)
  const [activeBatchStatus, setActiveBatchStatus] = useState<IndexingBatch['status'] | null>(null)

  // Progress error states
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [indexError, setIndexError] = useState<string | null>(null)

  // Hidden background indexing state
  const [failedImages, setFailedImages] = useState<{ id: string; imageId?: number; url: string; filename: string; error_message?: string }[]>([])
  const [showFailedModal, setShowFailedModal] = useState(false)
  const [selectedFailedModalBatchId, setSelectedFailedModalBatchId] = useState<string | null>(null)
  const [isActionInProgress, setIsActionInProgress] = useState(false)

  const pollingRef = useRef<number | null>(null)
  const activeBatchIdRef = useRef<string | null>(null)
  const batchHistoryLoadMoreRef = useRef<HTMLDivElement | null>(null)
  const uploadedFilesRef = useRef<{ name: string; url: string }[]>([])
  const operationStartedAtRef = useRef<number | null>(null)
  const lastProgressAtRef = useRef<number | null>(null)
  const lastFinishedCountRef = useRef(0)
  const stageTimesRef = useRef<{
    totalStartedAt: number | null
    uploadStartedAt: number | null
    uploadCompletedAt: number | null
    semanticStartedAt: number | null
    semanticCompletedAt: number | null
    ocrStartedAt: number | null
    ocrCompletedAt: number | null
  }>({
    totalStartedAt: null,
    uploadStartedAt: null,
    uploadCompletedAt: null,
    semanticStartedAt: null,
    semanticCompletedAt: null,
    ocrStartedAt: null,
    ocrCompletedAt: null,
  })

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const formatElapsedTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor(seconds / 60)
    const remainingSeconds = seconds % 60
    return hours > 0
      ? `${hours}h ${(minutes % 60).toString().padStart(2, '0')}m`
      : minutes > 0
        ? `${minutes}m ${remainingSeconds.toString().padStart(2, '0')}s`
        : `${remainingSeconds}s`
  }

  const toTimestamp = (value?: string | null) => value ? new Date(value).getTime() : null

  const applyServerTiming = (status: {
    created_at?: string | null
    upload_started_at?: string | null
    upload_completed_at?: string | null
    semantic_started_at?: string | null
    semantic_completed_at?: string | null
    ocr_started_at?: string | null
    ocr_completed_at?: string | null
  }) => {
    const uploadStartedAt = toTimestamp(status.upload_started_at)
    const semanticCompletedAtValue = toTimestamp(status.semantic_completed_at)
    stageTimesRef.current = {
      totalStartedAt: uploadStartedAt ?? toTimestamp(status.created_at),
      uploadStartedAt,
      uploadCompletedAt: toTimestamp(status.upload_completed_at),
      semanticStartedAt: toTimestamp(status.semantic_started_at),
      semanticCompletedAt: semanticCompletedAtValue,
      ocrStartedAt: toTimestamp(status.ocr_started_at),
      ocrCompletedAt: toTimestamp(status.ocr_completed_at),
    }
    setSemanticCompletedAt(semanticCompletedAtValue)
    operationStartedAtRef.current = stageTimesRef.current.totalStartedAt
  }

  useEffect(() => {
    activeBatchIdRef.current = activeBatchId
  }, [activeBatchId])

  useEffect(() => {
    if (!activeBatchId && !isUploading && !isBackgroundIndexing) return

    const updateRuntimeMetrics = () => {
      const now = Date.now()
      const elapsed = (start: number | null, end: number | null) => start
        ? Math.max(0, Math.floor(((end ?? now) - start) / 1000))
        : 0
      const times = stageTimesRef.current
      setElapsedSeconds(elapsed(times.totalStartedAt, times.ocrCompletedAt))
      setUploadElapsedSeconds(elapsed(times.uploadStartedAt, times.uploadCompletedAt))
      setSemanticElapsedSeconds(elapsed(times.semanticStartedAt, times.semanticCompletedAt))
      setOcrElapsedSeconds(elapsed(times.ocrStartedAt, times.ocrCompletedAt))
      if (isBackgroundIndexing && lastProgressAtRef.current) {
        setStalledSeconds(Math.floor((now - lastProgressAtRef.current) / 1000))
      }
    }
    updateRuntimeMetrics()
    const timer = window.setInterval(updateRuntimeMetrics, 1_000)
    return () => window.clearInterval(timer)
  }, [activeBatchId, isUploading, isBackgroundIndexing])

  // --- Drag & Drop Handlers ---
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(true)
  }

  const handleDragLeave = () => {
    setIsDragging(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const filesArray = Array.from(e.dataTransfer.files).filter(file =>
        ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      )
      if (filesArray.length > 0) {
        setSelectedFiles(prev => [...prev, ...filesArray])
      }
    }
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files).filter(file =>
        ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
      )
      setSelectedFiles(prev => [...prev, ...filesArray])
      e.target.value = ''
    }
  }

  const removeFile = (index: number) => {
    setSelectedFiles(prev => prev.filter((_, i) => i !== index))
  }

  const clearAllFiles = () => {
    setSelectedFiles([])
  }

  const pollBatchStatus = async (targetBatchId: string) => {
    try {
      const statusRes = await adminApi.getBatchStatus(targetBatchId)
      setTotalIndexCount(statusRes.total_images)
      setIndexedCount(statusRes.processed_images)
      setFailedIndexCount(statusRes.failed_images)
      setQueuedIndexCount(statusRes.queued_images)
      setRunningIndexCount(statusRes.running_images)
      setOcrProcessedCount(statusRes.ocr_processed_images)
      setOcrFailedCount(statusRes.ocr_failed_images)
      setOcrQueuedCount(statusRes.ocr_queued_images)
      setOcrRunningCount(statusRes.ocr_running_images)
      setActiveBatchStatus(statusRes.status)
      setIsUploading(statusRes.is_uploading)
      setIsBackgroundIndexing(statusRes.status === 'queued' || statusRes.status === 'running')
      setUploadSuccess(!statusRes.is_uploading)
      if (!statusRes.is_uploading) {
        setUploadProgress(100)
        setUploadedCount(statusRes.total_images)
        setTotalUploadCount(statusRes.total_images)
      }
      applyServerTiming(statusRes)
      if (['completed', 'failed', 'cancelled'].includes(statusRes.status)) {
        activeBatchIdRef.current = null
      }

      const total = statusRes.total_images
      const finished = statusRes.processed_images + statusRes.failed_images
      const pct = total > 0 ? Math.round((finished / total) * 100) : statusRes.status === 'completed' ? 100 : 0
      setIndexProgress(pct)

      if (statusRes.failed_images > 0) {
        const failedItems = await adminApi.listIndexingItems(targetBatchId, {
          status: 'failed',
          page: 1,
          limit: 100,
        })
        setFailedImages(
          failedItems.items.map((item) => ({
            id: String(item.id),
            imageId: item.image_id,
            url: item.image_url,
            filename: item.filename,
            error_message: item.error_message ?? 'Trích xuất CLIP embedding thất bại hoặc tệp tin bị hỏng.',
          }))
        )
      } else {
        setFailedImages([])
      }

    } catch (err) {
      console.error('Lỗi khi kiểm tra tiến độ batch:', err)
    }
  }

  // --- Core Upload & Background Indexing Flow ---
  const handleUploadAndIndex = async () => {
    if (selectedFiles.length === 0) return

    const filesToUpload = [...selectedFiles]
    setSelectedFiles([]) // Xóa danh sách lựa chọn lập tức

    // Lưu thông tin file để hiển thị ảnh lỗi nếu cần
    uploadedFilesRef.current = filesToUpload.map(f => ({
      name: f.name,
      url: URL.createObjectURL(f)
    }))

    // Reset các trạng thái tiến độ
    setIsUploading(true)
    setIsBackgroundIndexing(true)
    setUploadProgress(0)
    setUploadedCount(0)
    setTotalUploadCount(filesToUpload.length)
    setUploadSuccess(false)
    setUploadError(null)
    setIndexError(null)
    setMessage(null)
    setFailedImages([])

    // Reset trạng thái index
    setIndexProgress(0)
    setIndexedCount(0)
    setFailedIndexCount(0)
    setTotalIndexCount(filesToUpload.length)
    setQueuedIndexCount(0)
    setRunningIndexCount(0)
    setOcrProcessedCount(0)
    setOcrFailedCount(0)
    setOcrQueuedCount(0)
    setOcrRunningCount(0)
    setElapsedSeconds(0)
    setUploadElapsedSeconds(0)
    setSemanticElapsedSeconds(0)
    setOcrElapsedSeconds(0)
    setSemanticCompletedAt(null)
    setStalledSeconds(0)
    setActiveBatchId(null)
    setActiveBatchStatus('queued')
    // eslint-disable-next-line react-hooks/purity
    operationStartedAtRef.current = Date.now()
    // eslint-disable-next-line react-hooks/purity
    lastProgressAtRef.current = Date.now()
    lastFinishedCountRef.current = 0

    let batchId: string | null = null
    let uploadCompleted = false

    try {
      // Upload theo chunk; mỗi chunk được AI queue ngay, không phải chờ toàn bộ ảnh tải xong.
      const batch = await adminApi.createIndexingBatch()
      const createdBatchId = batch.batch_id
      batchId = createdBatchId
      setActiveBatchId(createdBatchId)
      activeBatchIdRef.current = createdBatchId
      setActiveBatchStatus(batch.status)
      applyServerTiming(batch)
      const chunkSize = 10

      const pollStatus = async () => {
        try {
          const statusRes = await adminApi.getBatchStatus(createdBatchId)

          setTotalIndexCount(statusRes.total_images)
          setIndexedCount(statusRes.processed_images)
          setFailedIndexCount(statusRes.failed_images)
          setQueuedIndexCount(statusRes.queued_images)
          setRunningIndexCount(statusRes.running_images)
          setOcrProcessedCount(statusRes.ocr_processed_images)
          setOcrFailedCount(statusRes.ocr_failed_images)
          setOcrQueuedCount(statusRes.ocr_queued_images)
          setOcrRunningCount(statusRes.ocr_running_images)
          setActiveBatchStatus(statusRes.status)
          applyServerTiming(statusRes)

          const total = statusRes.total_images
          const finished = statusRes.processed_images + statusRes.failed_images
          const allStageFinished = finished + statusRes.ocr_processed_images + statusRes.ocr_failed_images
          if (allStageFinished > lastFinishedCountRef.current) {
            lastFinishedCountRef.current = allStageFinished
            lastProgressAtRef.current = Date.now()
            setStalledSeconds(0)
          }
          const pct = total > 0 ? Math.round((finished / total) * 100) : statusRes.status === 'completed' ? 100 : 0
          setIndexProgress(pct)

          if (statusRes.failed_images > 0) {
            const failedItems = await adminApi.listIndexingItems(createdBatchId, {
              status: 'failed',
              page: 1,
              limit: 100,
            })
            setFailedImages(failedItems.items.map((item) => ({
              id: String(item.id),
              imageId: item.image_id,
              url: item.image_url,
              filename: item.filename,
              error_message: item.error_message ?? 'Tr?ch xu?t CLIP embedding th?t b?i ho?c t?p tin b? h?ng.',
            })))
          } else {
            setFailedImages([])
          }

          if (
            statusRes.status === 'completed' ||
            statusRes.status === 'failed' ||
            statusRes.status === 'cancelled'
          ) {
            if (operationStartedAtRef.current) {
              setElapsedSeconds(Math.floor((Date.now() - operationStartedAtRef.current) / 1000))
            }
            setIsBackgroundIndexing(false)
            activeBatchIdRef.current = null
            setStalledSeconds(0)
            if (statusRes.status === 'failed') {
              const errorMessage = statusRes.error_message || 'Đợt tối ưu hóa tìm kiếm bị thất bại trên server.'
              setIndexError(errorMessage)
            }

            if (pollingRef.current) {
              clearInterval(pollingRef.current)
              pollingRef.current = window.setInterval(() => {
                fetchStatus(false)
              }, 5000)
            }

            fetchStatus(false)

            if (statusRes.status === 'failed') {
              setMessage({
                text: statusRes.error_message || 'Đợt tối ưu hóa tìm kiếm bị thất bại trên server.',
                type: 'error'
              })
            } else if (statusRes.status === 'cancelled') {
              setMessage({ text: 'Đợt xử lý đã được dừng.', type: 'info' })
            } else if (statusRes.failed_images > 0) {
              setMessage({
                text: `Tải lên hoàn tất! Phát hiện ${statusRes.failed_images} ảnh gặp sự cố tối ưu tìm kiếm (lỗi trích xuất vector).`,
                type: 'info'
              })
            } else {
              setMessage({
                text: `Tuyệt vời! Đã tải lên và hoàn thành cấu hình tìm kiếm thành công cho toàn bộ ${statusRes.total_images} ảnh.`,
                type: 'success'
              })
            }
          }
        } catch (pollErr) {
          console.error('Lỗi khi kiểm tra tiến độ indexing:', pollErr)
        }
      }

      // Theo dõi ngay từ chunk đầu tiên để thấy upload và AI xử lý song song.
      if (pollingRef.current) clearInterval(pollingRef.current)
      pollingRef.current = window.setInterval(pollStatus, 2000)

      for (let offset = 0; offset < filesToUpload.length; offset += chunkSize) {
        const chunk = filesToUpload.slice(offset, offset + chunkSize)
        await adminApi.uploadImagesToBatch(createdBatchId, chunk, (chunkPercent) => {
          const completedFiles = offset
          const currentChunkFiles = (chunkPercent / 100) * chunk.length
          const uploadedFiles = Math.min(filesToUpload.length, completedFiles + currentChunkFiles)
          setUploadedCount(Math.round(uploadedFiles))
          setUploadProgress(Math.round((uploadedFiles / filesToUpload.length) * 100))
        })
        setUploadedCount(Math.min(filesToUpload.length, offset + chunk.length))
      }

      await adminApi.completeIndexingBatch(createdBatchId)
      uploadCompleted = true
      setUploadProgress(100)
      setUploadedCount(filesToUpload.length)
      setIsUploading(false)
      setUploadSuccess(true)
      await pollStatus()

    } catch (err: unknown) {
      if (batchId) {
        try {
          await adminApi.completeIndexingBatch(batchId)
        } catch (completeErr) {
          console.error('Không thể đóng batch upload sau lỗi:', completeErr)
        }
      }
      console.error('Lỗi khi tải hoặc tối ưu ảnh:', err)
      setIsUploading(false)
      setIsBackgroundIndexing(false)
      setActiveBatchStatus('failed')
      const errorObj = err as { code?: string; message?: string }
      const isTimeout = errorObj.code === 'ECONNABORTED' || errorObj.message?.includes('timeout')
      const errorMessage = isTimeout
        ? 'Tải ảnh lên quá thời gian. Server có thể vẫn đang xử lý các ảnh đã nhận; hãy kiểm tra lịch sử batch.'
        : (errorObj.message || 'Lỗi hệ thống xảy ra khi tải hoặc tối ưu ảnh.')
      if (uploadCompleted) {
        setIndexError(errorMessage)
      } else {
        setUploadError(errorMessage)
        setIndexError('Không thể hoàn tất batch do quá trình tải ảnh bị gián đoạn.')
      }
      setMessage({
        text: errorMessage,
        type: 'error'
      })
      fetchStatus(false)
    }
  }



  // --- Failed Image Actions ---
  const handleSaveFailedImage = async (url: string) => {
    try {
      await adminApi.saveFailedImage(url)
      setFailedImages(prev => prev.filter(img => img.url !== url))
      setFailedIndexCount(prev => Math.max(0, prev - 1))
    } catch (err: unknown) {
      console.error('Lỗi khi lưu ảnh lỗi:', err)
    }
  }

  const handleDeleteFailedImage = async (url: string) => {
    const failedImage = failedImages.find((img) => img.url === url)
    if (!failedImage?.imageId) {
      setMessage({
        text: 'Không xác định được ảnh cần xóa khỏi server.',
        type: 'error'
      })
      return
    }

    try {
      await adminApi.deleteImage(failedImage.imageId)
      setFailedImages(prev => prev.filter(img => img.url !== url))
      setFailedIndexCount(prev => Math.max(0, prev - 1))
      setTotalIndexCount(prev => Math.max(0, prev - 1))
      await fetchStatus(false)
    } catch (err: unknown) {
      console.error('Lỗi khi xóa ảnh lỗi:', err)
      const errorObj = err as { message?: string }
      setMessage({
        text: errorObj.message || 'Không thể xóa ảnh khỏi server.',
        type: 'error'
      })
    }
  }

  const handleRetryFailedImage = async (img: { id: string; url: string; filename: string }) => {
    const targetBatchId = selectedFailedModalBatchId || activeBatchId
    if (!targetBatchId) {
      setMessage({
        text: 'Không xác định được mã batch để thử lại.',
        type: 'error'
      })
      return
    }

    const itemId = Number(img.id)
    setIsActionInProgress(true)
    try {
      const retryRes = await adminApi.retryFailedIndexingItems(
        targetBatchId,
        Number.isInteger(itemId) ? [itemId] : undefined
      )

      setFailedImages(prev => prev.filter(item => item.id !== img.id))
      setFailedIndexCount(prev => Math.max(0, prev - retryRes.retried_item_ids.length))
      setMessage({
        text: `Đã đưa ${retryRes.queued_items} ảnh vào hàng đợi thử lại!`,
        type: 'success'
      })
      fetchStatus(false)
      await pollBatchStatus(targetBatchId)
    } catch (err: unknown) {
      console.error('Lỗi khi thử lại ảnh:', err)
      const errorObj = err as { message?: string }
      setMessage({
        text: errorObj.message || 'Không thể thử lại trích xuất ảnh này.',
        type: 'error'
      })
    } finally {
      setIsActionInProgress(false)
    }
  }

  // Bulk Actions
  const handleSaveAllFailed = async () => {
    setIsActionInProgress(true)
    const list = [...failedImages]
    for (const img of list) {
      await handleSaveFailedImage(img.url)
    }
    setIsActionInProgress(false)
  }

  const handleDeleteAllFailed = async () => {
    if (!confirm('Bạn có chắc chắn muốn xóa toàn bộ các ảnh bị lỗi này khỏi hệ thống không?')) return
    setIsActionInProgress(true)
    const list = [...failedImages]
    for (const img of list) {
      await handleDeleteFailedImage(img.url)
    }
    setIsActionInProgress(false)
  }

  const handleRetryAllFailed = async () => {
    const targetBatchId = selectedFailedModalBatchId || activeBatchId
    if (!targetBatchId) {
      setMessage({
        text: 'Không xác định được mã batch để thử lại.',
        type: 'error'
      })
      return
    }

    const itemIds = failedImages
      .map((img) => Number(img.id))
      .filter((id) => Number.isInteger(id))

    setIsActionInProgress(true)
    try {
      const retryRes = await adminApi.retryFailedIndexingItems(
        targetBatchId,
        itemIds.length > 0 ? itemIds : undefined
      )
      setFailedImages([])
      setFailedIndexCount(0)
      setShowFailedModal(false)
      setMessage({
        text: `Đã đưa ${retryRes.queued_items} ảnh bị lỗi vào hàng đợi thử lại!`,
        type: 'success'
      })
      fetchStatus(false)
      await pollBatchStatus(targetBatchId)
    } catch (err: unknown) {
      console.error('Lỗi khi thử lại tất cả các ảnh bị lỗi:', err)
      const errorObj = err as { message?: string }
      setMessage({
        text: errorObj.message || 'Không thể thử lại toàn bộ các ảnh bị lỗi.',
        type: 'error'
      })
    } finally {
      setIsActionInProgress(false)
    }
  }

  const handleOpenFailedModalForBatch = async (batchId: string, failedCount: number) => {
    if (failedCount <= 0) return
    setSelectedFailedModalBatchId(batchId)
    setIsActionInProgress(true)
    try {
      const res = await adminApi.listIndexingItems(batchId, {
        status: 'failed',
        page: 1,
        limit: 100,
      })
      if (res.items && res.items.length > 0) {
        setFailedImages(
          res.items.map((item) => ({
            id: String(item.id),
            imageId: item.image_id,
            url: item.image_url,
            filename: item.filename,
            error_message: item.error_message ?? 'Trích xuất CLIP embedding thất bại hoặc tệp tin bị hỏng.',
          }))
        )
      } else {
        const list: typeof failedImages = []
        for (let i = 0; i < failedCount; i++) {
          list.push({
            id: `fail_${batchId}_${i}`,
            url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100',
            filename: `anh_loi_${i + 1}.jpg`,
            error_message: 'Trích xuất CLIP embedding thất bại hoặc tệp tin bị hỏng.',
          })
        }
        setFailedImages(list)
      }
      setShowFailedModal(true)
    } catch (err) {
      console.error('Lỗi khi lấy danh sách ảnh lỗi của batch:', err)
      const list: typeof failedImages = []
      for (let i = 0; i < failedCount; i++) {
        list.push({
          id: `fail_${batchId}_${i}`,
          url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100',
          filename: `anh_loi_${i + 1}.jpg`,
          error_message: 'Trích xuất CLIP embedding thất bại hoặc tệp tin bị hỏng.',
        })
      }
      setFailedImages(list)
      setShowFailedModal(true)
    } finally {
      setIsActionInProgress(false)
    }
  }

  const handleCancelBatch = async (batchId: string) => {
    if (!confirm('Dừng đợt xử lý này? Các ảnh còn đang chờ sẽ không được index.')) return

    setIsActionInProgress(true)
    try {
      const cancelledBatch = await adminApi.cancelIndexingBatch(batchId)
      if (activeBatchId === batchId) {
        setActiveBatchStatus(cancelledBatch.status)
        setQueuedIndexCount(cancelledBatch.queued_images)
        setRunningIndexCount(cancelledBatch.running_images)
        setIsBackgroundIndexing(false)
        setStalledSeconds(0)
      }
      setMessage({ text: `Đã dừng batch ${batchId}.`, type: 'info' })
      await fetchStatus(false)
    } catch (err: unknown) {
      const errorObj = err as { message?: string }
      setMessage({ text: errorObj.message || 'Không thể dừng batch.', type: 'error' })
    } finally {
      setIsActionInProgress(false)
    }
  }

  const handleStartNewBatch = () => {
    uploadedFilesRef.current.forEach((file) => URL.revokeObjectURL(file.url))
    uploadedFilesRef.current = []
    setSelectedFiles([])
    setUploadSuccess(false)
    setUploadProgress(0)
    setUploadedCount(0)
    setTotalUploadCount(0)
    setIndexProgress(0)
    setIndexedCount(0)
    setFailedIndexCount(0)
    setTotalIndexCount(0)
    setQueuedIndexCount(0)
    setRunningIndexCount(0)
    setOcrProcessedCount(0)
    setOcrFailedCount(0)
    setOcrQueuedCount(0)
    setOcrRunningCount(0)
    setElapsedSeconds(0)
    setUploadElapsedSeconds(0)
    setSemanticElapsedSeconds(0)
    setOcrElapsedSeconds(0)
    setSemanticCompletedAt(null)
    setStalledSeconds(0)
    setActiveBatchId(null)
    setActiveBatchStatus(null)
    setUploadError(null)
    setIndexError(null)
    setMessage(null)
    operationStartedAtRef.current = null
    stageTimesRef.current = {
      totalStartedAt: null,
      uploadStartedAt: null,
      uploadCompletedAt: null,
      semanticStartedAt: null,
      semanticCompletedAt: null,
      ocrStartedAt: null,
      ocrCompletedAt: null,
    }
    lastProgressAtRef.current = null
    lastFinishedCountRef.current = 0
  }

  // --- Load Status & Batches ---
  const fetchStatus = async (showLoadingIndicator = false) => {
    if (showLoadingIndicator) setIsLoading(true)
    try {
      const batchesData = await adminApi.getIndexingBatches()
      setBatches(batchesData)
      const currentBatchId = activeBatchIdRef.current
      if (currentBatchId) {
        await pollBatchStatus(currentBatchId)
      } else if (!activeBatchId) {
        const resumableBatch = batchesData.find((batch) =>
          batch.is_uploading || batch.status === 'queued' || batch.status === 'running'
        )
        if (resumableBatch) {
          setActiveBatchId(resumableBatch.batch_id)
          activeBatchIdRef.current = resumableBatch.batch_id
          setActiveBatchStatus(resumableBatch.status)
          setIsUploading(resumableBatch.is_uploading)
          setIsBackgroundIndexing(true)
          setUploadSuccess(!resumableBatch.is_uploading)
          setTotalUploadCount(resumableBatch.total_images)
          setUploadedCount(resumableBatch.total_images)
          setUploadProgress(resumableBatch.is_uploading ? 0 : 100)
          applyServerTiming(resumableBatch)
          await pollBatchStatus(resumableBatch.batch_id)
        }
      }
    } catch (err) {
      console.error('Lỗi khi fetch indexing batches:', err)
    } finally {
      if (showLoadingIndicator) setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus(true)

    const intervalId = window.setInterval(() => {
      fetchStatus(false)
    }, INDEXING_POLL_INTERVAL_MS)

    pollingRef.current = intervalId

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  // The polling callback reads activeBatchIdRef, so it intentionally stays stable.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const displayedBatches = useMemo(() => {
    return batches.slice(0, visibleBatchHistoryCount)
  }, [batches, visibleBatchHistoryCount])

  const hasMoreBatchHistory = displayedBatches.length < batches.length

  useEffect(() => {
    const target = batchHistoryLoadMoreRef.current
    if (!target || !hasMoreBatchHistory) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisibleBatchHistoryCount((current) => current + BATCH_HISTORY_PAGE_LIMIT)
        }
      },
      { rootMargin: '420px 0px' },
    )

    observer.observe(target)

    return () => observer.disconnect()
  }, [hasMoreBatchHistory])

  const finishedIndexCount = indexedCount + failedIndexCount
  const remainingIndexCount = Math.max(totalIndexCount - finishedIndexCount, 0)
  const indexRatePerMinute = semanticElapsedSeconds > 0
    ? (finishedIndexCount / semanticElapsedSeconds) * 60
    : 0
  const estimatedRemainingSeconds = finishedIndexCount > 0 && remainingIndexCount > 0
    ? Math.ceil(remainingIndexCount / (finishedIndexCount / Math.max(semanticElapsedSeconds, 1)))
    : remainingIndexCount === 0 ? 0 : null
  const ocrFinishedCount = ocrProcessedCount + ocrFailedCount
  const ocrTargetCount = Math.max(indexedCount, totalIndexCount - failedIndexCount)
  const ocrRemainingCount = Math.max(ocrTargetCount - ocrFinishedCount, 0)
  const ocrRatePerMinute = ocrElapsedSeconds > 0
    ? (ocrFinishedCount / ocrElapsedSeconds) * 60
    : 0
  const estimatedOcrRemainingSeconds = ocrFinishedCount > 0 && ocrRemainingCount > 0
    ? Math.ceil(ocrRemainingCount / (ocrFinishedCount / Math.max(ocrElapsedSeconds, 1)))
    : ocrRemainingCount === 0 ? 0 : null
  const ocrProgress = ocrTargetCount > 0
    ? Math.min(100, Math.round((ocrFinishedCount / ocrTargetCount) * 100))
    : 0

  const showUploader = !isUploading && !isBackgroundIndexing && !uploadSuccess
  const isStalled = isBackgroundIndexing && stalledSeconds >= 60
  const didIndexingComplete = activeBatchStatus === 'completed'
  const didIndexingFail = activeBatchStatus === 'failed'
  const wasIndexingCancelled = activeBatchStatus === 'cancelled'
  const isSemanticComplete = Boolean(semanticCompletedAt)
    || (!isUploading && totalIndexCount > 0 && finishedIndexCount >= totalIndexCount)
  const isOcrComplete = didIndexingComplete
    || (isSemanticComplete && ocrRemainingCount === 0)
  const displayedRemainingSeconds = isBackgroundIndexing
    ? estimatedRemainingSeconds
    : didIndexingComplete ? 0 : null

  const currentStage = (() => {
    if (wasIndexingCancelled) return 'Đợt xử lý đã được dừng'
    if (didIndexingFail) return 'Đợt xử lý kết thúc do lỗi'
    if (didIndexingComplete) return 'Đã hoàn tất CLIP và OCR'
    if (isSemanticComplete && !isOcrComplete) return 'Tìm kiếm ngữ nghĩa đã sẵn sàng; OCR đang chạy nền'
    if (isUploading && runningIndexCount > 0) return 'Đang tải ảnh và xử lý AI song song'
    if (isUploading) return 'Đang tải ảnh lên server'
    if (isBackgroundIndexing && runningIndexCount > 0) {
      return 'CLIP và OCR đang chạy song song theo từng ảnh'
    }
    if (isBackgroundIndexing && queuedIndexCount > 0) return 'Đang chờ AI worker nhận ảnh'
    if (isBackgroundIndexing) return 'Đang đồng bộ trạng thái xử lý'
    return 'Sẵn sàng'
  })()

  return (
    <PageContainer size="wide" className="space-y-6 py-5 sm:py-8">
      {/* Page Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-1 border border-border text-ink-primary shadow-xs">
            <Database className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <h1 className="font-display text-xl font-bold tracking-tight text-ink-primary sm:text-2xl">
              Tải ảnh lên
            </h1>
            <p className="text-sm text-ink-secondary mt-1">
              Duyệt hoặc kéo thả hình ảnh để tải trực tiếp lên hệ thống và tự động tối ưu hóa tìm kiếm.
            </p>
          </div>
        </div>
      </div>

      {/* Thông báo kết quả */}
      {message && (
        <div className={`flex items-start gap-2.5 rounded-xl border p-3 text-sm sm:p-4 ${message.type === 'success'
          ? 'border-emerald-100 bg-emerald-50/50 text-emerald-800'
          : message.type === 'info'
            ? 'border-blue-100 bg-blue-50/50 text-blue-800'
            : 'border-red-100 bg-red-50/50 text-red-800'
          }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
          ) : message.type === 'info' ? (
            <Info className="h-4 w-4 shrink-0 mt-0.5 text-blue-600" />
          ) : (
            <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
          )}
          <div className="flex-1">
            <span className="font-medium">{message.text}</span>
            {failedImages.length > 0 && (
              <button
                type="button"
                onClick={() => setShowFailedModal(true)}
                className="ml-2 inline-flex items-center gap-1 text-red-600 hover:text-red-800 font-bold underline cursor-pointer"
              >
                [Xem chi tiết ảnh lỗi ({failedImages.length})]
              </button>
            )}
          </div>
          <button
            type="button"
            onClick={() => setMessage(null)}
            className="ml-auto text-ink-muted hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* UPLOAD PANEL */}
      <div className="space-y-4 rounded-xl border border-border bg-surface-2 p-4 shadow-2xs sm:p-5">
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
              {showUploader ? 'Chọn tệp ảnh nguồn' : 'Tiến trình tải và xử lý ảnh'}
            </h2>
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">
              {showUploader
                ? 'Kéo thả hoặc duyệt ảnh từ thiết bị của bạn. Hệ thống sẽ tự động cấu hình vector tìm kiếm trong nền.'
                : 'Theo dõi tiến độ upload, hàng đợi AI và kết quả indexing của batch hiện tại.'}
            </p>
          </div>

          {showUploader && (
            <>
              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => document.getElementById('file-upload-input')?.click()}
                className={`flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed p-5 text-center cursor-pointer transition-all duration-200 sm:p-8 ${isDragging
                  ? 'border-accent-600 bg-surface-1/60'
                  : 'border-border hover:border-accent-600 hover:bg-surface-1/40'
                  }`}
              >
                <input
                  id="file-upload-input"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="h-10 w-10 text-ink-muted mb-3 animate-bounce" style={{ animationDuration: '3s' }} />
                <p className="text-sm font-bold text-ink-primary">Kéo & thả ảnh vào đây</p>
                <p className="text-xs text-ink-muted mt-1">hoặc nhấn để duyệt tệp tin từ máy</p>
              </div>

              {/* Files preview list */}
              {selectedFiles.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-ink-secondary">
                      Đã chọn {selectedFiles.length} ảnh
                    </span>
                    <button
                      type="button"
                      onClick={clearAllFiles}
                      className="text-red-500 hover:text-red-700 font-semibold cursor-pointer"
                    >
                      Xóa tất cả
                    </button>
                  </div>

                  <div className="max-h-56 overflow-y-auto border border-border rounded-lg bg-surface-1/40 divide-y divide-border/60">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center gap-3 p-3 text-xs text-ink-secondary">
                        <span className="min-w-0 flex-1 truncate font-mono text-ink-primary" title={file.name}>
                          {file.name}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-ink-muted">{formatFileSize(file.size)}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              removeFile(index)
                            }}
                            className="text-ink-muted hover:text-red-500 cursor-pointer"
                          >
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* DUAL PROGRESS BARS */}
          {(isUploading || isBackgroundIndexing || uploadSuccess || uploadError || indexError) && (
            <div className="space-y-4 rounded-xl border border-border bg-surface-1 p-3 sm:p-4">
              {/* 1. UPLOAD PROGRESS */}
              <div className="space-y-1.5">
                <div className="flex flex-col gap-2 text-xs font-semibold sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex min-w-0 items-start gap-1.5 text-ink-secondary sm:items-center">
                    {uploadError ? (
                      <>
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="text-red-700">Tải ảnh thất bại: {uploadError}</span>
                      </>
                    ) : isUploading ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-600" />
                        Đang tải ảnh lên server: {uploadedCount} / {totalUploadCount} ảnh
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-700">Tải lên server hoàn tất!</span>
                      </>
                    )}
                  </span>
                  <span className={`text-ink-muted ${uploadError ? 'text-red-500' : ''}`}>{uploadProgress}%</span>
                </div>
                <div className="w-full bg-surface-0 rounded-full h-2 border border-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${uploadError ? 'bg-red-500' : isUploading ? 'bg-accent-600' : 'bg-emerald-600'}`}
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>

              {/* 2. INDEXING PROGRESS */}
              <div className="space-y-1.5 pt-3 border-t border-border/60">
                <div className="flex flex-col gap-2 text-xs font-semibold sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex min-w-0 items-start gap-1.5 text-ink-secondary sm:items-center">
                    {indexError ? (
                      <>
                        <XCircle className="h-4 w-4 text-red-500 shrink-0" />
                        <span className="text-red-700">Tối ưu hóa thất bại: {indexError}</span>
                      </>
                    ) : isBackgroundIndexing && !isSemanticComplete ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                        Đang tạo vector CLIP: {indexedCount + failedIndexCount} / {totalIndexCount} ảnh
                      </>
                    ) : isSemanticComplete ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-700">Tìm kiếm ngữ nghĩa đã sẵn sàng!</span>
                      </>
                    ) : wasIndexingCancelled ? (
                      <>
                        <XCircle className="h-4 w-4 text-amber-600" />
                        <span className="text-amber-700">Đã dừng xử lý batch</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-red-600" />
                        <span className="text-red-700">Xử lý kết thúc do lỗi</span>
                      </>
                    )}
                  </span>
                  <span className={`text-ink-muted ${indexError ? 'text-red-500' : ''}`}>{indexProgress}%</span>
                </div>
                <div className="w-full bg-surface-0 rounded-full h-2 border border-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${indexError
                      ? 'bg-red-500'
                      : isBackgroundIndexing && !isSemanticComplete
                        ? 'bg-amber-500 animate-pulse'
                        : isSemanticComplete
                          ? 'bg-emerald-600'
                          : wasIndexingCancelled
                            ? 'bg-amber-600'
                            : 'bg-red-600'
                      }`}
                    style={{ width: `${indexProgress}%` }}
                  />
                </div>

                <div className="flex flex-col gap-2 pt-1 text-xs sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-2 text-ink-muted">
                    <span className="text-emerald-600 font-medium">Thành công: {indexedCount}</span>
                    <span>|</span>
                    <span className={failedIndexCount > 0 ? "text-red-500 font-bold" : "text-ink-muted"}>
                      Thất bại: {failedIndexCount}
                    </span>
                  </div>

                  {failedIndexCount > 0 && !isBackgroundIndexing && !isUploading && (
                    <button
                      type="button"
                      onClick={() => setShowFailedModal(true)}
                      className="flex items-center gap-1 text-red-500 hover:text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded font-semibold cursor-pointer animate-pulse"
                    >
                      <AlertTriangle className="h-3 w-3" />
                      Xem chi tiết lỗi ({failedIndexCount})
                    </button>
                  )}
                </div>
              </div>

              {/* 3. OCR PROGRESS */}
              <div className="space-y-1.5 pt-3 border-t border-border/60">
                <div className="flex flex-col gap-2 text-xs font-semibold sm:flex-row sm:items-center sm:justify-between">
                  <span className="flex min-w-0 items-center gap-1.5 text-ink-secondary">
                    {!isOcrComplete && !wasIndexingCancelled ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-600" />
                    ) : ocrFailedCount > 0 ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
                    ) : (
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    )}
                    <span>
                      {!isOcrComplete && !wasIndexingCancelled
                        ? `OCR đang chạy song song: ${ocrFinishedCount} / ${ocrTargetCount} ảnh`
                        : `OCR đã kết thúc: ${ocrProcessedCount} thành công, ${ocrFailedCount} thất bại`}
                    </span>
                  </span>
                  <span className="text-ink-muted">{ocrProgress}%</span>
                </div>
                <div className="w-full bg-surface-0 rounded-full h-2 border border-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${!isOcrComplete && !wasIndexingCancelled
                      ? 'bg-blue-500 animate-pulse'
                      : ocrFailedCount > 0
                        ? 'bg-amber-500'
                        : 'bg-emerald-600'
                      }`}
                    style={{ width: `${ocrProgress}%` }}
                  />
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-3xs text-ink-muted">
                  <span>Đang chờ: {ocrQueuedCount} ảnh</span>
                  <span>Đang xử lý: {ocrRunningCount} ảnh</span>
                  <span>Tốc độ: {ocrFinishedCount > 0 ? `${ocrRatePerMinute.toFixed(1)} ảnh/phút` : '--'}</span>
                  <span>ETA: {estimatedOcrRemainingSeconds === null ? '--' : formatElapsedTime(estimatedOcrRemainingSeconds)}</span>
                </div>
              </div>

              <div className="space-y-3 pt-3 border-t border-border/60">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-2 text-xs text-ink-secondary">
                    {isUploading || isBackgroundIndexing ? (
                      <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-accent-600" />
                    ) : didIndexingComplete ? (
                      <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                    ) : (
                      <XCircle className={`h-3.5 w-3.5 shrink-0 ${wasIndexingCancelled ? 'text-amber-600' : 'text-red-600'}`} />
                    )}
                    <span className="font-semibold">{currentStage}</span>
                  </div>
                  <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center">
                    {activeBatchId && (
                      <span className="max-w-full truncate font-mono text-xs text-ink-muted" title={activeBatchId}>
                        Batch: {activeBatchId}
                      </span>
                    )}
                    {activeBatchId && isBackgroundIndexing && !isUploading && (
                      <button
                        type="button"
                        onClick={() => handleCancelBatch(activeBatchId)}
                        disabled={isActionInProgress}
                        className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-3xs font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                      >
                        <XCircle className="h-3 w-3" />
                        Dừng
                      </button>
                    )}
                  </div>
                </div>

                <dl className="grid grid-cols-2 overflow-hidden rounded-lg border border-border/60 sm:grid-cols-4">
                  {[
                    ['Tổng thời gian', elapsedSeconds],
                    ['Upload', uploadElapsedSeconds],
                    ['CLIP / Qdrant', semanticElapsedSeconds],
                    ['OCR', ocrElapsedSeconds],
                  ].map(([label, seconds], index) => (
                    <div key={String(label)} className={`${index % 2 ? 'border-l' : ''} ${index >= 2 ? 'border-t sm:border-t-0' : ''} px-3 py-3 sm:border-l sm:first:border-l-0 border-border/60`}>
                      <dt className="text-3xs font-semibold uppercase text-ink-muted">{label}</dt>
                      <dd className="mt-1 flex items-center gap-1.5 text-sm font-bold text-ink-primary">
                        <Clock className="h-3.5 w-3.5 text-ink-muted" />
                        {formatElapsedTime(Number(seconds))}
                      </dd>
                    </div>
                  ))}
                </dl>

                <dl className="grid grid-cols-2 border-y border-border/60 sm:grid-cols-5">
                  <div className="py-3 pr-3 sm:border-r sm:border-border/60">
                    <dt className="text-3xs font-semibold uppercase text-ink-muted">CLIP đã chạy</dt>
                    <dd className="mt-1 flex items-center gap-1.5 text-sm font-bold text-ink-primary">
                      <Clock className="h-3.5 w-3.5 text-ink-muted" />
                      {formatElapsedTime(semanticElapsedSeconds)}
                    </dd>
                  </div>
                  <div className="border-l border-border/60 py-3 pl-3 sm:border-l-0 sm:border-r sm:px-3">
                    <dt className="text-3xs font-semibold uppercase text-ink-muted">Tốc độ</dt>
                    <dd className="mt-1 text-sm font-bold text-ink-primary">
                      {finishedIndexCount > 0 ? `${indexRatePerMinute.toFixed(1)} ảnh/phút` : '--'}
                    </dd>
                  </div>
                  <div className="border-t border-border/60 py-3 pr-3 sm:border-r sm:border-t-0 sm:px-3">
                    <dt className="text-3xs font-semibold uppercase text-ink-muted">Còn lại ước tính</dt>
                    <dd className="mt-1 text-sm font-bold text-ink-primary">
                      {displayedRemainingSeconds === null ? '--' : formatElapsedTime(displayedRemainingSeconds)}
                    </dd>
                  </div>
                  <div className="border-l border-t border-border/60 py-3 pl-3 sm:border-l-0 sm:border-r sm:border-t-0 sm:px-3">
                    <dt className="text-3xs font-semibold uppercase text-ink-muted">Đang chờ</dt>
                    <dd className="mt-1 text-sm font-bold text-ink-primary">{queuedIndexCount} ảnh</dd>
                  </div>
                  <div className="col-span-2 border-t border-border/60 py-3 sm:col-span-1 sm:border-t-0 sm:pl-3">
                    <dt className="text-3xs font-semibold uppercase text-ink-muted">Đang xử lý</dt>
                    <dd className="mt-1 text-sm font-bold text-ink-primary">{runningIndexCount} ảnh</dd>
                  </div>
                </dl>

                {isStalled && (
                  <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <div>
                      <p className="font-semibold">Không có ảnh hoàn thành trong {formatElapsedTime(stalledSeconds)}.</p>
                      <p className="mt-0.5 text-3xs leading-relaxed text-amber-800">
                        AI có thể đang đọc OCR trên ảnh phức tạp hoặc worker bị nghẽn. Kiểm tra log AI nếu thời gian tiếp tục tăng.
                      </p>
                    </div>
                  </div>
                )}

                <p className="flex items-start gap-1.5 text-3xs leading-relaxed text-ink-muted">
                  <Info className="mt-0.5 h-3 w-3 shrink-0" />
                  Tốc độ và thời gian còn lại được ước tính từ toàn bộ thời gian đã chạy; số liệu sẽ ổn định hơn sau vài ảnh đầu tiên.
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-border">
          {uploadSuccess && !isUploading && !isBackgroundIndexing ? (
            <button
              type="button"
              onClick={handleStartNewBatch}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold text-ink-primary border border-border bg-surface-1 hover:bg-surface-0 transition-colors shadow-xs cursor-pointer"
            >
              <Upload className="h-4 w-4" />
              <span>Tải đợt ảnh mới</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleUploadAndIndex}
              disabled={isUploading || isBackgroundIndexing || selectedFiles.length === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold text-white bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
            >
              {isUploading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang tải lên server...</span>
                </>
              ) : isBackgroundIndexing ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang xử lý tối ưu...</span>
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4" />
                  <span>Tải ảnh lên Server</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* LỊCH SỬ CÁC ĐỢT TẢI ẢNH */}
      <div className="space-y-4 rounded-xl border border-border bg-surface-2 p-4 shadow-2xs sm:p-5">
        <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-ink-muted" />
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
              Lịch sử các đợt tải ảnh lên hệ thống
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-3xs text-ink-muted">Cập nhật tự động mỗi 5 giây</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
          </div>
        </div>

        <div className="hidden overflow-x-auto md:block">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-1/40 border-b border-border text-ink-muted uppercase font-bold tracking-wider">
                <th className="px-6 py-3 font-semibold">Mã Đợt</th>
                <th className="px-6 py-3 font-semibold">Trạng thái xử lý</th>
                <th className="px-6 py-3 font-semibold">Tổng số ảnh</th>
                <th className="px-6 py-3 font-semibold">Đã tối ưu tìm kiếm</th>
                <th className="px-6 py-3 font-semibold">Bị lỗi</th>
                <th className="px-6 py-3 font-semibold">Thời gian tải</th>
                <th className="px-6 py-3 font-semibold">Thông tin thêm</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-ink-secondary">
              {isLoading && batches.length === 0 ? (
                Array.from({ length: 3 }).map((_, i) => (
                  <tr key={i} className="animate-pulse">
                    <td className="px-6 py-4"><div className="h-3 bg-surface-1 rounded w-28" /></td>
                    <td className="px-6 py-4"><div className="h-3 bg-surface-1 rounded w-16" /></td>
                    <td className="px-6 py-4"><div className="h-3 bg-surface-1 rounded w-8" /></td>
                    <td className="px-6 py-4"><div className="h-3 bg-surface-1 rounded w-8" /></td>
                    <td className="px-6 py-4"><div className="h-3 bg-surface-1 rounded w-8" /></td>
                    <td className="px-6 py-4"><div className="h-3 bg-surface-1 rounded w-20" /></td>
                    <td className="px-6 py-4"><div className="h-3 bg-surface-1 rounded w-32" /></td>
                  </tr>
                ))
              ) : batches.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-ink-muted italic">
                    Chưa có lịch sử đợt tải ảnh nào.
                  </td>
                </tr>
              ) : (
                displayedBatches.map((b) => (
                  <tr key={b.id} className="text-ink-secondary hover:bg-surface-1/5 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-ink-primary">{b.batch_id}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-3xs font-semibold ${b.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                        b.status === 'running' ? 'bg-amber-50 text-amber-700 border border-amber-200' :
                          b.status === 'queued' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                            'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                        {(b.status === 'running' || b.status === 'queued') && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        {b.status === 'queued' ? 'ĐANG CHỜ' :
                          b.status === 'running' ? 'ĐANG CHẠY' :
                            b.status === 'completed' ? 'HOÀN THÀNH' :
                              b.status === 'cancelled' ? 'ĐÃ HỦY' : 'THẤT BẠI'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-ink-primary">{b.total_images}</td>
                    <td className="px-6 py-4">
                      {b.status === 'queued' || b.status === 'running' ? (
                        <div className="flex items-center gap-1 font-bold text-amber-600">
                          <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                          <span>{b.processed_images}/{b.total_images}</span>
                        </div>
                      ) : (
                        <span className="text-emerald-600 font-bold">{b.processed_images}</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {b.failed_images > 0 ? (
                        <button
                          type="button"
                          onClick={() => handleOpenFailedModalForBatch(b.batch_id, b.failed_images)}
                          className="text-red-600 font-bold hover:text-red-800 hover:underline cursor-pointer transition-colors inline-flex items-center gap-1"
                          title="Nhấn để xem chi tiết ảnh bị lỗi"
                        >
                          <span>{b.failed_images}</span>
                        </button>
                      ) : (
                        <span className="text-ink-muted font-bold">0</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-ink-muted">
                      {new Date(b.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-6 py-4 text-red-500 font-medium max-w-xs" title={b.error_message || ''}>
                      {b.status === 'running' || b.status === 'queued' ? (
                        <button
                          type="button"
                          onClick={() => handleCancelBatch(b.batch_id)}
                          disabled={isActionInProgress}
                          className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          Dừng
                        </button>
                      ) : (
                        <span className="block truncate">{b.error_message || '-'}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="divide-y divide-border/60 md:hidden">
          {isLoading && batches.length === 0 ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="space-y-3 py-4 first:pt-0">
                <div className="h-4 w-3/4 animate-pulse rounded bg-surface-1" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-surface-1" />
              </div>
            ))
          ) : batches.length === 0 ? (
            <p className="py-8 text-center text-sm italic text-ink-muted">
              Chưa có lịch sử đợt tải ảnh nào.
            </p>
          ) : (
            displayedBatches.map((batch) => (
              <article key={batch.id} className="space-y-3 py-4 first:pt-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-mono text-xs font-semibold text-ink-primary" title={batch.batch_id}>
                      {batch.batch_id}
                    </p>
                    <time className="mt-1 block text-xs text-ink-muted">
                      {new Date(batch.created_at).toLocaleString('vi-VN')}
                    </time>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-xs font-semibold ${batch.status === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                    batch.status === 'running' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                      batch.status === 'queued' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                        'border-red-200 bg-red-50 text-red-700'
                    }`}>
                    {(batch.status === 'running' || batch.status === 'queued') && (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    )}
                    {batch.status === 'queued' ? 'Đang chờ' :
                      batch.status === 'running' ? 'Đang chạy' :
                        batch.status === 'completed' ? 'Hoàn thành' :
                          batch.status === 'cancelled' ? 'Đã hủy' : 'Thất bại'}
                  </span>
                </div>

                <dl className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <dt className="font-semibold text-ink-muted">Tổng</dt>
                    <dd className="mt-1 font-bold text-ink-primary">{batch.total_images}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-muted">Đã xử lý</dt>
                    <dd className="mt-1 font-bold text-emerald-700">{batch.processed_images}</dd>
                  </div>
                  <div>
                    <dt className="font-semibold text-ink-muted">Lỗi</dt>
                    <dd className="mt-1 font-bold text-red-700">{batch.failed_images}</dd>
                  </div>
                </dl>

                <div className="flex flex-wrap items-center justify-between gap-2">
                  {batch.failed_images > 0 && (
                    <button
                      type="button"
                      onClick={() => handleOpenFailedModalForBatch(batch.batch_id, batch.failed_images)}
                      className="inline-flex min-h-11 items-center text-xs font-semibold text-red-700 underline underline-offset-2"
                    >
                      Xem {batch.failed_images} ảnh lỗi
                    </button>
                  )}
                  {(batch.status === 'running' || batch.status === 'queued') && (
                    <button
                      type="button"
                      onClick={() => handleCancelBatch(batch.batch_id)}
                      disabled={isActionInProgress}
                      className="ml-auto inline-flex min-h-11 items-center gap-1 rounded-md border border-red-200 px-3 text-xs font-semibold text-red-600 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" />
                      Dừng
                    </button>
                  )}
                  {batch.error_message && batch.status !== 'running' && batch.status !== 'queued' && (
                    <p className="w-full break-words text-xs text-red-600">{batch.error_message}</p>
                  )}
                </div>
              </article>
            ))
          )}
        </div>

        {!isLoading && batches.length > 0 && (
          <div className="border-t border-border pt-4 text-center">
            <p className="mb-3 text-xs text-ink-muted">
              Hiển thị <span className="font-semibold text-ink-secondary">{displayedBatches.length}</span> trên{' '}
              <span className="font-semibold text-ink-secondary">{batches.length}</span> đợt tải ảnh
            </p>

            {hasMoreBatchHistory ? (
              <button
                type="button"
                onClick={() => setVisibleBatchHistoryCount((current) => current + BATCH_HISTORY_PAGE_LIMIT)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-lg border border-border bg-white px-4 text-sm font-bold text-ink-secondary shadow-sm shadow-slate-200/50 transition-colors hover:bg-surface-1 hover:text-ink-primary sm:w-auto"
              >
                Tải thêm lịch sử
              </button>
            ) : (
              <p className="text-xs font-medium text-ink-muted">
                Đã hiển thị toàn bộ lịch sử tải ảnh.
              </p>
            )}

            {hasMoreBatchHistory && <div ref={batchHistoryLoadMoreRef} className="h-4 w-full" />}
          </div>
        )}
      </div>

      {/* FAILED IMAGES HANDLER MODAL */}
      {showFailedModal && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 p-0 backdrop-blur-xs sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-2xl flex-col rounded-t-xl border border-border bg-surface-2 shadow-xl animate-in fade-in-50 zoom-in-95 duration-200 sm:max-h-[85vh] sm:rounded-xl">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-border p-4">
              <div className="flex items-center gap-2 text-red-600">
                <AlertCircle className="h-5 w-5" />
                <h3 className="font-display font-bold text-base text-ink-primary">
                  Sự cố tối ưu tìm kiếm ({failedImages.length})
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowFailedModal(false)}
                className="text-ink-muted hover:text-ink-primary rounded-lg p-1 hover:bg-surface-3 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Description Warning */}
            <div className="p-4 bg-amber-50/50 border-b border-amber-100 text-amber-800 text-3xs leading-relaxed flex items-start gap-2">
              <Info className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Lưu ý:</span> Các ảnh này đã lưu trên máy chủ nhưng trích xuất vector đặc trưng (CLIP) bị lỗi. Chúng sẽ không thể tìm thấy bằng hình ảnh hoặc từ khóa. Vui lòng xử lý:
              </div>
            </div>

            {/* Bulk Control Bar */}
            {failedImages.length > 0 && (
              <div className="flex flex-col gap-2 border-b border-border/80 bg-surface-1 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="text-3xs font-semibold text-ink-muted">Tác vụ hàng loạt:</span>
                <div className="grid grid-cols-3 gap-2 sm:flex sm:items-center">
                  <button
                    type="button"
                    onClick={handleRetryAllFailed}
                    disabled={isActionInProgress}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-accent-50 hover:bg-accent-100 text-accent-700 text-3xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <RefreshCw className={`h-3 w-3 ${isActionInProgress ? 'animate-spin' : ''}`} />
                    Thử lại tất cả
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveAllFailed}
                    disabled={isActionInProgress}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-3xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="h-3 w-3" />
                    Lưu tất cả
                  </button>
                  <button
                    type="button"
                    onClick={handleDeleteAllFailed}
                    disabled={isActionInProgress}
                    className="flex items-center gap-1 px-2.5 py-1 rounded bg-red-50 hover:bg-red-100 text-red-700 text-3xs font-semibold transition-colors disabled:opacity-50 cursor-pointer"
                  >
                    <Trash2 className="h-3 w-3" />
                    Xóa tất cả
                  </button>
                </div>
              </div>
            )}

            {/* Modal Body / Items List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3.5 divide-y divide-border/60">
              {failedImages.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-ink-muted">
                  <CheckCircle2 className="h-10 w-10 text-emerald-600 mb-2" />
                  <p className="text-xs font-bold text-ink-primary">Đã giải quyết xong tất cả các ảnh lỗi!</p>
                  <p className="text-3xs mt-1">Bạn có thể đóng modal.</p>
                </div>
              ) : (
                failedImages.map((img) => (
                  <div key={img.id} className="flex flex-col gap-3 pt-3.5 first:pt-0 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex gap-3 min-w-0">
                      {/* Image Thumbnail */}
                      <div className="h-12 w-12 rounded border border-border bg-surface-1 overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          src={img.url}
                          alt={img.filename}
                          onError={(e) => {
                            ; (e.currentTarget as HTMLImageElement).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100'
                          }}
                          className="h-full w-full object-cover"
                        />
                      </div>

                      {/* Details */}
                      <div className="min-w-0">
                        <p className="text-3xs font-bold font-mono text-ink-primary truncate max-w-[280px]" title={img.filename}>
                          {img.filename}
                        </p>
                        <p className="text-3xs text-red-500 mt-1 font-semibold flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3 shrink-0" />
                          <span>{img.error_message || 'Trích xuất CLIP embedding thất bại'}</span>
                        </p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex shrink-0 justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => handleRetryFailedImage(img)}
                        disabled={isActionInProgress}
                        title="Thử lại"
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface-1 text-ink-secondary transition-colors hover:bg-accent-50 hover:text-accent-700 disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${isActionInProgress ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveFailedImage(img.url)}
                        title="Chấp nhận lưu"
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface-1 text-ink-secondary transition-colors hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFailedImage(img.url)}
                        title="Xóa khỏi Server"
                        className="flex h-11 w-11 items-center justify-center rounded-lg border border-border bg-surface-1 text-ink-secondary transition-colors hover:bg-red-50 hover:text-red-700"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-border p-3 flex justify-end bg-surface-1/50">
              <button
                type="button"
                onClick={() => setShowFailedModal(false)}
                className="px-4 py-1.5 text-xs font-semibold text-ink-primary bg-surface-2 border border-border rounded-lg hover:bg-surface-3 transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </PageContainer>
  )
}
