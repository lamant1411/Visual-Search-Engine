import { useEffect, useState, useRef } from 'react'
import { Database, Play, Loader2, AlertCircle, CheckCircle2, XCircle, Clock, Upload, X } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { adminApi, type IndexingStatus, type IndexingBatch } from '@/lib/api/admin'

export default function AdminIndexingPage() {
  const [status, setStatus] = useState<IndexingStatus | null>(null)
  const [batches, setBatches] = useState<IndexingBatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isTriggering, setIsTriggering] = useState(false)
  const [batchSize, setBatchSize] = useState<number>(500)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  
  // Tab & Upload states
  const [activeTab, setActiveTab] = useState<'system' | 'upload'>('system')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  const pollingRef = useRef<number | null>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

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

  const handleUploadAndTrigger = async () => {
    if (selectedFiles.length === 0) return
    
    setIsUploading(true)
    setUploadProgress(0)
    setMessage(null)

    const progressInterval = window.setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 95) {
          clearInterval(progressInterval)
          return prev
        }
        const increment = Math.floor(Math.random() * 12) + 6
        return Math.min(95, prev + increment)
      })
    }, 120)

    try {
      const uploadRes = await adminApi.uploadImagesForIndexing(selectedFiles)
      
      clearInterval(progressInterval)
      setUploadProgress(100)
      
      await new Promise(resolve => setTimeout(resolve, 500))
      
      const count = uploadRes.uploaded_count || selectedFiles.length
      const triggerRes = await adminApi.triggerIndexing(count)
      
      setMessage({
        text: `Đã tải lên ${count} hình ảnh và kích hoạt indexing thành công. Mã Task: ${triggerRes.task_id}`,
        type: 'success'
      })
      setSelectedFiles([])
      await fetchStatus(false)
    } catch (err: any) {
      clearInterval(progressInterval)
      setMessage({
        text: err?.message || 'Có lỗi xảy ra trong quá trình tải lên hoặc kích hoạt indexing.',
        type: 'error'
      })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  // Hàm load status và danh sách batches từ API
  const fetchStatus = async (showLoadingIndicator = false) => {
    if (showLoadingIndicator) setIsLoading(true)
    try {
      const [statusData, batchesData] = await Promise.all([
        adminApi.getIndexingStatus(),
        adminApi.getIndexingBatches()
      ])
      setStatus(statusData)
      setBatches(batchesData)
    } catch (err) {
      console.error('Lỗi khi fetch indexing status/batches:', err)
    } finally {
      if (showLoadingIndicator) setIsLoading(false)
    }
  }

  // Khởi động polling mỗi 5 giây
  useEffect(() => {
    fetchStatus(true)

    // Thiết lập interval polling mỗi 5 giây
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

  // Trigger Indexing cho một batch ảnh mới
  const handleTriggerIndexing = async (e: React.FormEvent) => {
    e.preventDefault()
    if (batchSize <= 0) {
      setMessage({ text: 'Số lượng ảnh phải lớn hơn 0.', type: 'error' })
      return
    }
    
    setIsTriggering(true)
    setMessage(null)
    
    try {
      const res = await adminApi.triggerIndexing(batchSize)
      setMessage({ text: res.message, type: 'success' })
      // Cập nhật lại status và danh sách batches ngay lập tức
      await fetchStatus(false)
    } catch (err: any) {
      setMessage({ text: err?.message || 'Có lỗi xảy ra khi kích hoạt indexing.', type: 'error' })
    } finally {
      setIsTriggering(false)
    }
  }

  return (
    <PageContainer size="wide" className="py-8 space-y-6">
      {/* Page Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-1 border border-border text-ink-primary shadow-xs">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink-primary">
              Tiến trình Indexing
            </h1>
            <p className="text-sm text-ink-secondary mt-1">
              Trích xuất đặc trưng hình ảnh (Image Embedding) và đồng bộ hóa Vector DB.
            </p>
          </div>
        </div>
      </div>

      {/* Thông báo kết quả trigger */}
      {message && (
        <div className={`flex items-start gap-2.5 p-4 rounded-xl border text-sm ${
          message.type === 'success'
            ? 'border-emerald-100 bg-emerald-50/50 text-emerald-800'
            : 'border-red-100 bg-red-50/50 text-red-800'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-600" />
          ) : (
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-3">
        {/* Trigger indexing form / uploads */}
        <div className="bg-surface-2 rounded-xl border border-border shadow-2xs p-5 space-y-4 md:col-span-1 flex flex-col">
          {/* Tab Selector */}
          <div className="flex border-b border-border mb-1">
            <button
              type="button"
              onClick={() => setActiveTab('system')}
              disabled={isUploading || isTriggering}
              className={`flex-1 pb-2.5 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-colors cursor-pointer disabled:opacity-50 ${
                activeTab === 'system'
                  ? 'border-accent-600 text-accent-600'
                  : 'border-transparent text-ink-muted hover:text-ink-secondary'
              }`}
            >
              Hệ thống
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              disabled={isUploading || isTriggering}
              className={`flex-1 pb-2.5 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-colors cursor-pointer disabled:opacity-50 ${
                activeTab === 'upload'
                  ? 'border-accent-600 text-accent-600'
                  : 'border-transparent text-ink-muted hover:text-ink-secondary'
              }`}
            >
              Tải lên trực tiếp
            </button>
          </div>

          {activeTab === 'system' ? (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
                Kích hoạt Indexing mới
              </h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                Quét thư mục ảnh mới tải lên trên hệ thống, chạy trích xuất CLIP embeddings và đưa vào cơ sở dữ liệu vector.
              </p>

              <form onSubmit={handleTriggerIndexing} className="space-y-4 pt-2">
                <div className="space-y-1.5">
                  <label htmlFor="batch-size" className="text-xs font-semibold text-ink-secondary">
                    Số lượng ảnh trong Batch
                  </label>
                  <input
                    id="batch-size"
                    type="number"
                    min="10"
                    max="5000"
                    value={batchSize}
                    onChange={(e) => setBatchSize(parseInt(e.target.value) || 0)}
                    disabled={status?.status === 'running' || status?.status === 'queued' || isTriggering}
                    className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-ink-primary focus:border-accent-600 focus:outline-none disabled:opacity-50 disabled:bg-surface-0 transition-colors"
                  />
                </div>

                <button
                  type="submit"
                  disabled={status?.status === 'running' || status?.status === 'queued' || isTriggering || batchSize <= 0}
                  className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-ink-primary hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
                >
                  {isTriggering ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Đang kết nối...</span>
                    </>
                  ) : (status?.status === 'running' || status?.status === 'queued') ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Đang xử lý batch cũ...</span>
                    </>
                  ) : (
                    <>
                      <Play className="h-4 w-4 fill-current" />
                      <span>Chạy Indexing</span>
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : (
            <div className="space-y-4">
              <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
                Tải lên ảnh trực tiếp
              </h2>
              <p className="text-xs text-ink-muted leading-relaxed">
                Tải các tệp hình ảnh từ máy tính của bạn lên thư mục tạm và tự động kích hoạt tiến trình indexing cho chúng.
              </p>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  if (!isUploading && !(status?.status === 'running' || status?.status === 'queued')) {
                    document.getElementById('file-upload-input')?.click()
                  }
                }}
                className={`flex flex-col items-center justify-center border border-dashed rounded-lg p-5 text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-accent-600 bg-surface-1/60'
                    : 'border-border hover:border-accent-600 hover:bg-surface-1/40'
                } ${(isUploading || status?.status === 'running' || status?.status === 'queued') ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input
                  id="file-upload-input"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="h-7 w-7 text-ink-muted mb-2 animate-bounce" style={{ animationDuration: '3s' }} />
                <p className="text-xs font-semibold text-ink-primary">Kéo & thả ảnh ở đây</p>
                <p className="text-3xs text-ink-muted mt-1">hoặc nhấn để chọn các tệp từ thiết bị</p>
                <p className="text-3xs text-ink-muted mt-0.5">Chấp nhận JPG, PNG, WebP</p>
              </div>

              {/* Uploading progress indicator */}
              {isUploading && (
                <div className="space-y-2 p-3 bg-surface-1 rounded-lg border border-border">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink-secondary">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-600" />
                      Đang tải lên...
                    </span>
                    <span>{uploadProgress}%</span>
                  </div>
                  <div className="w-full bg-surface-0 rounded-full h-2 border border-border overflow-hidden">
                    <div
                      className="bg-accent-600 h-full rounded-full transition-all duration-200 ease-out"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Selected files list */}
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

                  <div className="max-h-36 overflow-y-auto border border-border rounded-lg bg-surface-1/40 divide-y divide-border/60">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 text-3xs text-ink-secondary">
                        <span className="truncate max-w-[160px] font-mono" title={file.name}>
                          {file.name}
                        </span>
                        <div className="flex items-center gap-2">
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
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleUploadAndTrigger()
                    }}
                    disabled={isUploading || status?.status === 'running' || status?.status === 'queued'}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Đang xử lý tải lên...</span>
                      </>
                    ) : (status?.status === 'running' || status?.status === 'queued') ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Đang chờ hoàn thành...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-current" />
                        <span>Tải lên & Chạy Indexing</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Indexing status & progress display */}
        <div className="bg-surface-2 rounded-xl border border-border shadow-2xs p-5 space-y-5 md:col-span-2">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
              Trạng thái hiện tại
            </h2>
            <div className="flex items-center gap-1.5">
              <span className="text-3xs text-ink-muted">Polling tự động mỗi 5s</span>
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
            </div>
          </div>

          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
              <Loader2 className="h-8 w-8 text-ink-muted animate-spin" />
              <p className="text-xs text-ink-muted">Đang tải trạng thái tiến trình...</p>
            </div>
          ) : !status ? (
            <div className="flex flex-col items-center justify-center py-12 gap-2 text-center text-ink-muted">
              <AlertCircle className="h-8 w-8 text-ink-muted" />
              <p className="text-sm">Không thể lấy thông tin trạng thái indexing.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Visual State Board */}
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-border rounded-xl p-4 bg-surface-1/40">
                  <p className="text-3xs font-bold text-ink-muted uppercase tracking-wider">Trạng thái tiến trình</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    {status.status === 'idle' && (
                      <span className="inline-flex items-center rounded-full bg-gray-50 border border-gray-200 px-2 py-0.5 text-xs font-semibold text-gray-700">
                        Sẵn sàng (Idle)
                      </span>
                    )}
                    {status.status === 'queued' && (
                      <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-xs font-semibold text-blue-700 animate-pulse">
                        Đang chờ (Queued)
                      </span>
                    )}
                    {status.status === 'running' && (
                      <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-700 animate-pulse">
                        Đang xử lý
                      </span>
                    )}
                    {status.status === 'completed' && (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        Hoàn thành
                      </span>
                    )}
                    {status.status === 'failed' && (
                      <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-2 py-0.5 text-xs font-semibold text-red-700">
                        Lỗi tiến trình
                      </span>
                    )}
                  </div>
                </div>

                <div className="border border-border rounded-xl p-4 bg-surface-1/40">
                  <p className="text-3xs font-bold text-ink-muted uppercase tracking-wider">Ảnh đã xử lý</p>
                  <p className="text-xl font-bold text-ink-primary mt-1.5 font-display">
                    {status.processed_count} / {status.total_count}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              {(status.status === 'running' || status.status === 'queued') && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink-secondary">
                    <span>Embedding extraction progress</span>
                    <span>{status.progress}%</span>
                  </div>
                  <div className="w-full bg-surface-1 rounded-full h-3.5 border border-border overflow-hidden">
                    <div
                      className="bg-emerald-500 h-full rounded-full transition-all duration-1000 ease-out"
                      style={{ width: `${status.progress}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Status details / results */}
              {status.status === 'completed' && (
                <div className="flex items-start gap-3 p-4 border border-emerald-100 bg-emerald-50/20 rounded-xl">
                  <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-emerald-800">Hoàn thành đợt indexing gần nhất</h3>
                    <p className="text-xs text-emerald-700 mt-0.5">
                      Đã trích xuất embeddings và đồng bộ hóa thành công {status.total_count} hình ảnh mới vào cơ sở dữ liệu Vector DB.
                    </p>
                  </div>
                </div>
              )}

              {status.status === 'failed' && (
                <div className="flex items-start gap-3 p-4 border border-red-100 bg-red-50/20 rounded-xl">
                  <XCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-red-800">Lỗi tiến trình</h3>
                    <p className="text-xs text-red-700 mt-0.5">
                      {status.error_message || 'Có lỗi hệ thống xảy ra khi đang trích xuất CLIP features. Hãy thử lại.'}
                    </p>
                  </div>
                </div>
              )}

              {status.status === 'idle' && (
                <div className="flex flex-col items-center justify-center py-6 text-center text-ink-muted">
                  <Database className="h-10 w-10 text-ink-muted mb-2" />
                  <p className="text-xs">Chưa có tiến trình nào được kích hoạt. Hãy tạo batch mới ở cột bên trái.</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Lịch sử các đợt Indexing */}
      <div className="bg-surface-2 rounded-xl border border-border shadow-2xs p-5 space-y-4">
        <div className="flex items-center gap-2 border-b border-border pb-3">
          <Clock className="h-4 w-4 text-ink-muted" />
          <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
            Lịch sử các đợt Indexing
          </h2>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-1/40 border-b border-border text-ink-muted uppercase font-bold tracking-wider">
                <th className="px-6 py-3 font-semibold">Mã Batch</th>
                <th className="px-6 py-3 font-semibold">Trạng thái</th>
                <th className="px-6 py-3 font-semibold">Tổng ảnh</th>
                <th className="px-6 py-3 font-semibold">Đã xử lý</th>
                <th className="px-6 py-3 font-semibold">Bị lỗi</th>
                <th className="px-6 py-3 font-semibold">Thời gian tạo</th>
                <th className="px-6 py-3 font-semibold">Chi tiết lỗi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
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
                    Chưa có lịch sử đợt indexing nào.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="text-ink-secondary hover:bg-surface-1/5 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-ink-primary">{b.batch_id}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-semibold ${
                        b.status === 'completed' ? 'bg-emerald-50 text-emerald-700' :
                        b.status === 'running' ? 'bg-amber-50 text-amber-700 animate-pulse' :
                        b.status === 'queued' ? 'bg-blue-50 text-blue-700' :
                        'bg-red-50 text-red-700'
                      }`}>
                        {b.status === 'queued' ? 'ĐANG CHỜ' :
                         b.status === 'running' ? 'ĐANG CHẠY' :
                         b.status === 'completed' ? 'HOÀN THÀNH' : 'THẤT BẠI'}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-semibold">{b.total_images}</td>
                    <td className="px-6 py-4 text-emerald-600 font-semibold">{b.processed_images}</td>
                    <td className="px-6 py-4 text-red-600 font-semibold">{b.failed_images}</td>
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
    </PageContainer>
  )
}
