import { useEffect, useState, useRef } from 'react'
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

export default function AdminIndexingPage() {
  const [batches, setBatches] = useState<IndexingBatch[]>([])
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

  // Hidden background indexing state
  const [failedImages, setFailedImages] = useState<{ id: string; url: string; filename: string; error_message?: string }[]>([])
  const [showFailedModal, setShowFailedModal] = useState(false)
  const [isActionInProgress, setIsActionInProgress] = useState(false)

  const pollingRef = useRef<number | null>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

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

  // --- Core Upload & Background Indexing Flow ---
  const handleUploadAndIndex = async () => {
    if (selectedFiles.length === 0) return

    const filesToUpload = [...selectedFiles]
    setSelectedFiles([]) // Clear selection list immediately

    // Reset progress/status states
    setIsUploading(true)
    setIsBackgroundIndexing(true)
    setUploadProgress(0)
    setUploadedCount(0)
    setTotalUploadCount(filesToUpload.length)
    setUploadSuccess(false)
    setMessage(null)
    setFailedImages([])

    // Reset indexing states
    setIndexProgress(0)
    setIndexedCount(0)
    setFailedIndexCount(0)
    setTotalIndexCount(filesToUpload.length)

    const localQueue: string[] = []
    const nameMap: Record<string, string> = {}

    let uploadDone = false
    let currentIdxFailed = 0
    let currentIdxProcessed = 0

    // Index worker consumer loop running in parallel/background
    const runIndexingConsumer = async () => {
      while (true) {
        if (localQueue.length > 0) {
          const url = localQueue.shift()!
          const filename = nameMap[url] || 'image.jpg'

          try {
            const indexResult = await adminApi.indexSingleImage(url)
            if (indexResult.success) {
              setIndexedCount(prev => prev + 1)
            } else {
              currentIdxFailed++
              setFailedIndexCount(prev => prev + 1)
              setFailedImages(prev => [
                ...prev,
                { id: `fail_${Date.now()}_${localQueue.length}`, url, filename, error_message: indexResult.error_message }
              ])
            }
          } catch (err: any) {
            currentIdxFailed++
            setFailedIndexCount(prev => prev + 1)
            setFailedImages(prev => [
              ...prev,
              { id: `fail_${Date.now()}_${localQueue.length}`, url, filename, error_message: err.message || 'Lỗi trích xuất vector' }
            ])
          }
          currentIdxProcessed++
          setIndexProgress(Math.round((currentIdxProcessed / filesToUpload.length) * 100))
        } else {
          // If uploading is finished and queue is empty, indexing has completed
          if (uploadDone && localQueue.length === 0) {
            break
          }
          // Sleep for 200ms waiting for the next uploaded image
          await new Promise(resolve => setTimeout(resolve, 200))
        }
      }
    }

    // Start background index consumer
    const consumerPromise = runIndexingConsumer()

    // Start uploading files sequentially
    for (let i = 0; i < filesToUpload.length; i++) {
      const file = filesToUpload[i]
      try {
        const res = await adminApi.uploadImageToServer(file)
        nameMap[res.url] = res.filename
        localQueue.push(res.url)
      } catch (uploadErr) {
        console.error(`Lỗi khi tải ảnh ${file.name} lên server:`, uploadErr)
      }
      setUploadedCount(i + 1)
      setUploadProgress(Math.round(((i + 1) / filesToUpload.length) * 100))
    }

    uploadDone = true
    setIsUploading(false)

    // Wait for indexing to catch up and complete in background
    await consumerPromise
    setIsBackgroundIndexing(false)
    setUploadSuccess(true)

    // Refresh history immediately after complete
    fetchStatus(false)

    if (currentIdxFailed > 0) {
      setMessage({
        text: `Tải lên và xử lý hoàn tất ${filesToUpload.length} ảnh. Phát hiện ${currentIdxFailed} ảnh gặp sự cố tối ưu tìm kiếm (lỗi trích xuất vector).`,
        type: 'info'
      })
    } else {
      setMessage({
        text: `Tuyệt vời! Đã tải lên và hoàn thành cấu hình tìm kiếm thành công cho toàn bộ ${filesToUpload.length} ảnh.`,
        type: 'success'
      })
    }
  }

  // --- Failed Image Actions ---
  const handleSaveFailedImage = async (url: string) => {
    try {
      await adminApi.saveFailedImage(url)
      setFailedImages(prev => prev.filter(img => img.url !== url))
      setFailedIndexCount(prev => Math.max(0, prev - 1))
    } catch (err: any) {
      console.error('Lỗi khi lưu ảnh lỗi:', err)
    }
  }

  const handleDeleteFailedImage = async (url: string) => {
    try {
      await adminApi.deletePendingImage(url)
      setFailedImages(prev => prev.filter(img => img.url !== url))
      setFailedIndexCount(prev => Math.max(0, prev - 1))
    } catch (err: any) {
      console.error('Lỗi khi xóa ảnh lỗi:', err)
    }
  }

  const handleRetryFailedImage = async (url: string) => {
    const target = failedImages.find(img => img.url === url)
    if (!target) return

    // Remove from active failed view temporarily
    setFailedImages(prev => prev.filter(img => img.url !== url))
    setFailedIndexCount(prev => Math.max(0, prev - 1))

    try {
      const result = await adminApi.indexSingleImage(url)
      if (result.success) {
        setIndexedCount(prev => prev + 1)
      } else {
        // Put back to failed list with updated message
        setFailedImages(prev => [...prev, { ...target, error_message: result.error_message }])
        setFailedIndexCount(prev => prev + 1)
      }
    } catch (err: any) {
      setFailedImages(prev => [...prev, { ...target, error_message: err.message }])
      setFailedIndexCount(prev => prev + 1)
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
    setIsActionInProgress(true)
    const list = [...failedImages]
    for (const img of list) {
      await handleRetryFailedImage(img.url)
    }
    setIsActionInProgress(false)
  }

  // --- Load Status & Batches ---
  const fetchStatus = async (showLoadingIndicator = false) => {
    if (showLoadingIndicator) setIsLoading(true)
    try {
      const batchesData = await adminApi.getIndexingBatches()
      setBatches(batchesData)
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
    }, 5000)

    pollingRef.current = intervalId

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current)
      }
    }
  }, [])

  return (
    <PageContainer size="default" className="py-8 space-y-6">
      {/* Page Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-1 border border-border text-ink-primary shadow-xs">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink-primary">
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
        <div className={`flex items-start gap-2.5 p-4 rounded-xl border text-sm ${message.type === 'success'
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
      <div className="bg-surface-2 rounded-xl border border-border shadow-2xs p-5 space-y-4">
        <div className="space-y-4">
          <div>
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
              Chọn tệp ảnh nguồn
            </h2>
            <p className="text-xs text-ink-muted mt-1 leading-relaxed">
              Kéo thả hoặc duyệt ảnh từ thiết bị của bạn. Hệ thống sẽ tự động cấu hình vector tìm kiếm trong nền.
            </p>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => {
              if (!isUploading && !isBackgroundIndexing) {
                document.getElementById('file-upload-input')?.click()
              }
            }}
            className={`flex flex-col items-center justify-center border border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-200 ${isDragging
                ? 'border-accent-600 bg-surface-1/60'
                : 'border-border hover:border-accent-600 hover:bg-surface-1/40'
              } ${(isUploading || isBackgroundIndexing) ? 'opacity-50 pointer-events-none' : ''}`}
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
                  <div key={index} className="flex items-center justify-between p-3 text-xs text-ink-secondary">
                    <span className="truncate max-w-[280px] font-mono text-ink-primary" title={file.name}>
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
                        disabled={isUploading}
                        className="text-ink-muted hover:text-red-500 cursor-pointer disabled:opacity-50"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* DUAL PROGRESS BARS */}
          {(isUploading || isBackgroundIndexing || uploadSuccess) && (
            <div className="space-y-4 p-4 border border-border bg-surface-1 rounded-xl">
              {/* 1. UPLOAD PROGRESS */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-ink-secondary flex items-center gap-1.5">
                    {isUploading ? (
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
                  <span className="text-ink-muted">{uploadProgress}%</span>
                </div>
                <div className="w-full bg-surface-0 rounded-full h-2 border border-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${isUploading ? 'bg-accent-600' : 'bg-emerald-600'}`}
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>

              {/* 2. INDEXING PROGRESS */}
              <div className="space-y-1.5 pt-3 border-t border-border/60">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span className="text-ink-secondary flex items-center gap-1.5">
                    {isBackgroundIndexing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                        Đang tối ưu hóa tìm kiếm: {indexedCount + failedIndexCount} / {totalIndexCount} ảnh
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        <span className="text-emerald-700">Tối ưu hóa tìm kiếm hoàn tất!</span>
                      </>
                    )}
                  </span>
                  <span className="text-ink-muted">{indexProgress}%</span>
                </div>
                <div className="w-full bg-surface-0 rounded-full h-2 border border-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ease-out ${isBackgroundIndexing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-600'}`}
                    style={{ width: `${indexProgress}%` }}
                  />
                </div>

                <div className="flex items-center justify-between text-3xs pt-1">
                  <div className="flex items-center gap-2 text-ink-muted">
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
            </div>
          )}
        </div>

        <div className="pt-4 border-t border-border">
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
        </div>
      </div>

      {/* LỊCH SỬ CÁC ĐỢT TẢI ẢNH */}
      <div className="bg-surface-2 rounded-xl border border-border shadow-2xs p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
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

        <div className="overflow-x-auto">
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
                batches.map((b) => (
                  <tr key={b.id} className="text-ink-secondary hover:bg-surface-1/5 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-ink-primary">{b.batch_id}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-semibold ${b.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
                          b.status === 'running' ? 'bg-amber-50 text-amber-700 border border-amber-200 animate-pulse' :
                            b.status === 'queued' ? 'bg-blue-50 text-blue-700 border border-blue-200' :
                              'bg-red-50 text-red-700 border border-red-200'
                        }`}>
                        {b.status === 'queued' ? 'ĐANG CHỜ' :
                          b.status === 'running' ? 'ĐANG CHẠY' :
                            b.status === 'completed' ? 'HOÀN THÀNH' : 'THẤT BẠI'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-ink-primary">{b.total_images}</td>
                    <td className="px-6 py-4 text-emerald-600 font-bold">{b.processed_images}</td>
                    <td className="px-6 py-4 text-red-600 font-bold">{b.failed_images}</td>
                    <td className="px-6 py-4 text-ink-muted">
                      {new Date(b.created_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="px-6 py-4 text-red-500 font-medium max-w-xs truncate" title={b.error_message || ''}>
                      {b.error_message || '-'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* FAILED IMAGES HANDLER MODAL */}
      {showFailedModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/65 backdrop-blur-xs">
          <div className="bg-surface-2 border border-border w-full max-w-2xl rounded-xl shadow-xl flex flex-col max-h-[85vh] animate-in fade-in-50 zoom-in-95 duration-200">
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
              <div className="px-4 py-2.5 bg-surface-1 border-b border-border/80 flex items-center justify-between">
                <span className="text-3xs font-semibold text-ink-muted">Tác vụ hàng loạt:</span>
                <div className="flex items-center gap-2">
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
                  <div key={img.id} className="flex gap-3 pt-3.5 first:pt-0 items-start justify-between">
                    <div className="flex gap-3 min-w-0">
                      {/* Image Thumbnail */}
                      <div className="h-12 w-12 rounded border border-border bg-surface-1 overflow-hidden shrink-0 flex items-center justify-center">
                        <img
                          src={img.url}
                          alt={img.filename}
                          onError={(e) => {
                            ; (e.target as any).src = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=100'
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
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleRetryFailedImage(img.url)}
                        title="Thử lại"
                        className="p-1.5 rounded-lg border border-border bg-surface-1 hover:bg-accent-50 hover:text-accent-700 transition-colors text-ink-secondary cursor-pointer"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveFailedImage(img.url)}
                        title="Chấp nhận lưu"
                        className="p-1.5 rounded-lg border border-border bg-surface-1 hover:bg-emerald-50 hover:text-emerald-700 transition-colors text-ink-secondary cursor-pointer"
                      >
                        <Save className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteFailedImage(img.url)}
                        title="Xóa khỏi Server"
                        className="p-1.5 rounded-lg border border-border bg-surface-1 hover:bg-red-50 hover:text-red-700 transition-colors text-ink-secondary cursor-pointer"
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
