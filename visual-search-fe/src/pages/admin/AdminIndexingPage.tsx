import { useEffect, useState, useRef } from 'react'
import { Database, Play, Loader2, CheckCircle2, XCircle, Clock, Upload, X, FileText, Check, Info } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { adminApi, type IndexingBatch, type PendingImage } from '@/lib/api/admin'

export default function AdminIndexingPage() {
  const [batches, setBatches] = useState<IndexingBatch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null)
  
  // Cloudinary credentials from env
  const cloudinaryCloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME || ''
  const cloudinaryUploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET || ''
  
  // Section 1: Upload states
  const [uploadTab, setUploadTab] = useState<'direct' | 'csv'>('direct')
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [isDragging, setIsDragging] = useState(false)

  // CSV State
  const [csvFile, setCsvFile] = useState<File | null>(null)
  const [csvUrls, setCsvUrls] = useState<string[]>([])
  const [isCsvParsing, setIsCsvParsing] = useState(false)

  // Section 2: Indexing execution states
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const [indexingScope, setIndexingScope] = useState<'all' | 'selected'>('all')
  const [selectedImageUrls, setSelectedImageUrls] = useState<string[]>([])
  const [isIndexingRun, setIsIndexingRun] = useState(false)
  const [indexingStats, setIndexingStats] = useState({
    total: 0,
    processed: 0,
    currentBatch: 0,
    totalBatches: 0
  })

  const pollingRef = useRef<number | null>(null)

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  // --- Image Drag & Drop Handlers ---
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

  // --- Cloudinary Upload & Direct Import ---
  const uploadFileToCloudinary = async (file: File): Promise<string> => {
    // If not configured, mock the upload for demonstration
    if (
      !cloudinaryCloudName || 
      cloudinaryCloudName === 'your_cloud_name' || 
      !cloudinaryUploadPreset || 
      cloudinaryUploadPreset === 'your_upload_preset'
    ) {
      await new Promise(resolve => setTimeout(resolve, 600))
      const randomId = Math.floor(Math.random() * 1000)
      return `https://picsum.photos/id/${randomId % 200}/800/600`
    }

    const formData = new FormData()
    formData.append('file', file)
    formData.append('upload_preset', cloudinaryUploadPreset)

    const response = await fetch(`https://api.cloudinary.com/v1_1/${cloudinaryCloudName}/image/upload`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error(`Cloudinary upload failed: ${response.statusText}`)
    }

    const data = await response.json()
    return data.secure_url
  }

  const handleUploadAndImportDirect = async () => {
    if (selectedFiles.length === 0) return
    setIsUploading(true)
    setUploadProgress(0)
    setMessage(null)

    const total = selectedFiles.length
    let succeeded = 0
    const uploadedUrls: string[] = []

    try {
      for (let i = 0; i < total; i++) {
        const file = selectedFiles[i]
        try {
          const url = await uploadFileToCloudinary(file)
          uploadedUrls.push(url)
          succeeded++
        } catch (uploadErr) {
          console.error(`Lỗi khi tải ảnh ${file.name} lên Cloudinary:`, uploadErr)
        }
        setUploadProgress(Math.round(((i + 1) / total) * 100))
      }

      if (uploadedUrls.length === 0) {
        throw new Error('Tất cả ảnh tải lên Cloudinary đều thất bại.')
      }

      await adminApi.importImagesPending(uploadedUrls)
      
      const isMock = !cloudinaryCloudName || cloudinaryCloudName === 'your_cloud_name'
      const warningText = isMock ? ' (Giả lập upload do chưa cấu hình Cloudinary)' : ''
      
      setMessage({
        text: `Đã tải lên thành công ${succeeded}/${total} ảnh lên Cloudinary và lưu vào DB.${warningText}`,
        type: 'success'
      })
      setSelectedFiles([])
      await loadPendingImages()
    } catch (err: any) {
      setMessage({ text: err.message || 'Lỗi trong quá trình tải ảnh.', type: 'error' })
    } finally {
      setIsUploading(false)
      setUploadProgress(0)
    }
  }

  // --- CSV Import Handlers ---
  const handleCsvChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0]
      setCsvFile(file)
      setIsCsvParsing(true)
      
      const reader = new FileReader()
      reader.onload = (event) => {
        if (event.target?.result) {
          const text = event.target.result as string
          const urls = text
            .split(/\r?\n/)
            .map(line => line.trim())
            .filter(line => line && (line.startsWith('http://') || line.startsWith('https://')))
          setCsvUrls(urls)
        }
        setIsCsvParsing(false)
      }
      reader.onerror = () => {
        setMessage({ text: 'Lỗi khi đọc file CSV.', type: 'error' })
        setIsCsvParsing(false)
      }
      reader.readAsText(file)
    }
  }

  const handleImportCsv = async () => {
    if (csvUrls.length === 0) return
    setIsUploading(true)
    setMessage(null)
    
    try {
      const res = await adminApi.importImagesPending(csvUrls)
      setMessage({
        text: `Đã nhập thành công ${res.imported_count} ảnh từ file CSV dưới trạng thái pending.`,
        type: 'success'
      })
      setCsvFile(null)
      setCsvUrls([])
      await loadPendingImages()
    } catch (err: any) {
      setMessage({ text: err.message || 'Lỗi khi nhập danh sách ảnh.', type: 'error' })
    } finally {
      setIsUploading(false)
    }
  }

  // --- Indexing Execution (Batching & Progress) ---
  const handleRunIndexing = async () => {
    let urlsToIndex: string[] = []
    if (indexingScope === 'all') {
      urlsToIndex = pendingImages.map(img => img.url)
    } else {
      urlsToIndex = selectedImageUrls
    }

    if (urlsToIndex.length === 0) {
      setMessage({ text: 'Không có ảnh nào được chọn để index.', type: 'error' })
      return
    }

    setIsIndexingRun(true)
    setMessage(null)
    
    const total = urlsToIndex.length
    const batchSizeLimit = 500
    const totalBatches = Math.ceil(total / batchSizeLimit)
    
    setIndexingStats({
      total,
      processed: 0,
      currentBatch: 0,
      totalBatches
    })

    try {
      for (let batchIdx = 0; batchIdx < totalBatches; batchIdx++) {
        setIndexingStats(prev => ({ ...prev, currentBatch: batchIdx + 1 }))
        
        const start = batchIdx * batchSizeLimit
        const end = Math.min(start + batchSizeLimit, total)
        const batchUrls = urlsToIndex.slice(start, end)
        
        // Gọi API xử lý cho batch
        await adminApi.triggerIndexingForUrls(batchUrls)
        
        // Trì hoãn nhẹ giữa các batch để tạo cảm giác xử lý mượt mà trên UI
        await new Promise(resolve => setTimeout(resolve, 800))

        setIndexingStats(prev => ({
          ...prev,
          processed: end
        }))
      }

      setMessage({
        text: `Đã hoàn thành Indexing thành công cho tổng số ${total} hình ảnh.`,
        type: 'success'
      })
      
      // Reset danh sách lựa chọn
      setSelectedImageUrls([])
      // Làm mới dữ liệu
      await Promise.all([
        loadPendingImages(),
        fetchStatus(false)
      ])
    } catch (err: any) {
      setMessage({ text: err.message || 'Lỗi xảy ra trong quá trình chạy indexing.', type: 'error' })
    } finally {
      setIsIndexingRun(false)
    }
  }

  const toggleSelectImage = (url: string) => {
    setSelectedImageUrls(prev => 
      prev.includes(url) ? prev.filter(u => u !== url) : [...prev, url]
    )
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

  const loadPendingImages = async () => {
    try {
      const data = await adminApi.getPendingImages()
      setPendingImages(data)
    } catch (err) {
      console.error('Lỗi khi tải danh sách ảnh pending:', err)
    }
  }

  useEffect(() => {
    fetchStatus(true)
    loadPendingImages()

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
    <PageContainer size="wide" className="py-8 space-y-6">
      {/* Page Header */}
      <div className="border-b border-border pb-6">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-surface-1 border border-border text-ink-primary shadow-xs">
            <Database className="h-5 w-5" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-ink-primary">
              Trang Quản trị Indexing
            </h1>
            <p className="text-sm text-ink-secondary mt-1">
              Phân tách tác vụ: Nạp tệp ảnh vào hàng đợi và kích hoạt Indexing dữ liệu Vector.
            </p>
          </div>
        </div>
      </div>

      {/* Cloudinary Warning banner if using mock fallback */}
      {(!cloudinaryCloudName || cloudinaryCloudName === 'your_cloud_name') && (
        <div className="flex items-start gap-3 p-3.5 bg-amber-50/60 border border-amber-200/70 rounded-xl text-amber-800 text-xs leading-relaxed">
          <Info className="h-4.5 w-4.5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <span className="font-bold">Lưu ý cấu hình:</span> Cloudinary chưa được cài đặt biến môi trường trong file <code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-900">.env</code>. Hệ thống sẽ tự động sử dụng hình ảnh ngẫu nhiên giả lập (Mock URL) để bạn có thể trải nghiệm toàn vẹn các tính năng ngay lập tức.
          </div>
        </div>
      )}

      {/* Thông báo kết quả */}
      {message && (
        <div className={`flex items-start gap-2.5 p-4 rounded-xl border text-sm ${
          message.type === 'success'
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
          <span className="font-medium">{message.text}</span>
          <button 
            type="button" 
            onClick={() => setMessage(null)}
            className="ml-auto text-ink-muted hover:text-ink-primary"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        {/* SECTION 1: UPLOAD IMAGES */}
        <div className="bg-surface-2 rounded-xl border border-border shadow-2xs p-5 space-y-4 flex flex-col">
          <div className="flex border-b border-border mb-1">
            <button
              type="button"
              onClick={() => {
                setUploadTab('direct')
                setMessage(null)
              }}
              disabled={isUploading || isIndexingRun}
              className={`flex-1 pb-2.5 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-colors cursor-pointer disabled:opacity-50 ${
                uploadTab === 'direct'
                  ? 'border-accent-600 text-accent-600'
                  : 'border-transparent text-ink-muted hover:text-ink-secondary'
              }`}
            >
              Tải ảnh trực tiếp từ máy
            </button>
            <button
              type="button"
              onClick={() => {
                setUploadTab('csv')
                setMessage(null)
              }}
              disabled={isUploading || isIndexingRun}
              className={`flex-1 pb-2.5 text-xs font-bold uppercase tracking-wider text-center border-b-2 transition-colors cursor-pointer disabled:opacity-50 ${
                uploadTab === 'csv'
                  ? 'border-accent-600 text-accent-600'
                  : 'border-transparent text-ink-muted hover:text-ink-secondary'
              }`}
            >
              Tải danh sách ảnh qua CSV
            </button>
          </div>

          {uploadTab === 'direct' ? (
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
                  Tải lên Cloudinary & Lưu Pending
                </h2>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Chọn các ảnh từ thiết bị để lưu lên đám mây Cloudinary, sau đó đồng bộ URL vào cơ sở dữ liệu ở trạng thái chờ xử lý.
                </p>
              </div>

              {/* Drag & Drop Zone */}
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => {
                  if (!isUploading && !isIndexingRun) {
                    document.getElementById('file-upload-input')?.click()
                  }
                }}
                className={`flex flex-col items-center justify-center border border-dashed rounded-lg p-6 text-center cursor-pointer transition-all duration-200 ${
                  isDragging
                    ? 'border-accent-600 bg-surface-1/60'
                    : 'border-border hover:border-accent-600 hover:bg-surface-1/40'
                } ${(isUploading || isIndexingRun) ? 'opacity-50 pointer-events-none' : ''}`}
              >
                <input
                  id="file-upload-input"
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <Upload className="h-8 w-8 text-ink-muted mb-2 animate-bounce" style={{ animationDuration: '3s' }} />
                <p className="text-xs font-bold text-ink-primary">Kéo & thả ảnh ở đây</p>
                <p className="text-3xs text-ink-muted mt-1">hoặc nhấn để duyệt tệp từ máy tính</p>
                <p className="text-3xs text-ink-muted mt-0.5">Hỗ trợ định dạng JPG, PNG, WebP</p>
              </div>

              {/* Progress bar */}
              {isUploading && (
                <div className="space-y-2 p-3 bg-surface-1 rounded-lg border border-border">
                  <div className="flex items-center justify-between text-xs font-semibold text-ink-secondary">
                    <span className="flex items-center gap-1.5">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-600" />
                      Đang tải lên Cloudinary...
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

                  <div className="max-h-40 overflow-y-auto border border-border rounded-lg bg-surface-1/40 divide-y divide-border/60">
                    {selectedFiles.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2.5 text-3xs text-ink-secondary">
                        <span className="truncate max-w-[200px] font-mono text-ink-primary" title={file.name}>
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
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleUploadAndImportDirect}
                    disabled={isUploading || isIndexingRun}
                    className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        <span>Đang xử lý tải tệp...</span>
                      </>
                    ) : (
                      <>
                        <Play className="h-4 w-4 fill-current" />
                        <span>Tải lên Cloudinary & Lưu vào DB</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            // CSV tab
            <div className="space-y-4">
              <div>
                <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
                  Nhập danh sách URL từ file CSV
                </h2>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Tải lên tệp CSV chứa danh sách các đường dẫn ảnh trực tuyến. Mỗi URL nằm trên một dòng riêng biệt.
                </p>
              </div>

              <div className="border border-border bg-surface-1 rounded-lg p-5 flex flex-col gap-3">
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleCsvChange}
                  disabled={isUploading || isIndexingRun}
                  className="text-xs text-ink-secondary file:mr-3 file:py-1.5 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-surface-2 file:text-ink-primary hover:file:bg-surface-3 file:cursor-pointer disabled:opacity-50"
                />
                
                {isCsvParsing && (
                  <div className="flex items-center gap-1.5 text-3xs text-ink-muted">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Đang giải mã nội dung file...
                  </div>
                )}

                {csvFile && (
                  <div className="text-3xs text-ink-secondary flex items-center gap-1.5 font-mono">
                    <FileText className="h-3.5 w-3.5 text-accent-600" />
                    <span>File đã chọn: {csvFile.name} ({formatFileSize(csvFile.size)})</span>
                  </div>
                )}

                {csvUrls.length > 0 && (
                  <div className="p-3 bg-emerald-50/40 border border-emerald-100 rounded-lg text-emerald-800 text-xs">
                    <div className="font-bold flex items-center gap-1.5">
                      <Check className="h-4 w-4 text-emerald-600" />
                      Tìm thấy {csvUrls.length} đường dẫn hợp lệ!
                    </div>
                    <div className="max-h-24 overflow-y-auto mt-2 font-mono text-3xs text-emerald-700 divide-y divide-emerald-100/50">
                      {csvUrls.slice(0, 5).map((url, i) => (
                        <div key={i} className="py-1 truncate">{url}</div>
                      ))}
                      {csvUrls.length > 5 && <div className="py-1 italic">...và {csvUrls.length - 5} đường dẫn khác</div>}
                    </div>
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleImportCsv}
                disabled={isUploading || isIndexingRun || csvUrls.length === 0}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-ink-primary hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Đang nạp vào CSDL...</span>
                  </>
                ) : (
                  <>
                    <FileText className="h-4 w-4" />
                    <span>Nạp {csvUrls.length} ảnh Pending</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>

        {/* SECTION 2: INDEXING EXECUTION */}
        <div className="bg-surface-2 rounded-xl border border-border shadow-2xs p-5 space-y-4 flex flex-col justify-between">
          <div className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide flex items-center justify-between">
                <span>Kích hoạt Indexing ảnh</span>
                <span className="inline-flex items-center rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-3xs font-semibold text-blue-700">
                  {pendingImages.length} ảnh Pending
                </span>
              </h2>
              <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                Đưa danh sách ảnh chờ xử lý (Pending) qua quá trình trích xuất vector embedding và đồng bộ dữ liệu vào Vector DB.
              </p>
            </div>

            <div className="space-y-3 bg-surface-1 border border-border rounded-lg p-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-ink-secondary">Phạm vi Indexing</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    indexingScope === 'all' 
                      ? 'border-accent-600 bg-accent-50/5 text-accent-700' 
                      : 'border-border hover:bg-surface-2'
                  }`}>
                    <input
                      type="radio"
                      name="indexingScope"
                      checked={indexingScope === 'all'}
                      onChange={() => setIndexingScope('all')}
                      disabled={isIndexingRun}
                      className="accent-accent-600"
                    />
                    Index tất cả ({pendingImages.length})
                  </label>
                  <label className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-colors ${
                    indexingScope === 'selected' 
                      ? 'border-accent-600 bg-accent-50/5 text-accent-700' 
                      : 'border-border hover:bg-surface-2'
                  }`}>
                    <input
                      type="radio"
                      name="indexingScope"
                      checked={indexingScope === 'selected'}
                      onChange={() => setIndexingScope('selected')}
                      disabled={isIndexingRun}
                      className="accent-accent-600"
                    />
                    Tự chọn ảnh cụ thể
                  </label>
                </div>
              </div>

              {indexingScope === 'selected' && (
                <div className="space-y-2 pt-2 border-t border-border/60">
                  <label className="text-3xs font-bold text-ink-muted uppercase tracking-wide">
                    Chọn tệp từ danh sách Pending
                  </label>
                  <div className="flex gap-2">
                    <select
                      disabled={isIndexingRun || pendingImages.length === 0}
                      onChange={(e) => {
                        const val = e.target.value
                        if (val) {
                          toggleSelectImage(val)
                          e.target.value = ''
                        }
                      }}
                      className="flex-1 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-ink-primary focus:border-accent-600 focus:outline-none disabled:opacity-50"
                    >
                      <option value="">-- Nhấp để chọn ảnh --</option>
                      {pendingImages
                        .filter(img => !selectedImageUrls.includes(img.url))
                        .map(img => (
                          <option key={img.id} value={img.url}>
                            {img.filename}
                          </option>
                        ))
                      }
                    </select>
                  </div>

                  {/* Show Selected Items list */}
                  {selectedImageUrls.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                      <div className="flex items-center justify-between text-3xs">
                        <span className="font-bold text-ink-secondary">Đã chọn {selectedImageUrls.length} ảnh</span>
                        <button 
                          type="button" 
                          onClick={() => setSelectedImageUrls([])}
                          className="text-red-500 hover:underline font-semibold cursor-pointer"
                        >
                          Bỏ chọn hết
                        </button>
                      </div>
                      <div className="max-h-24 overflow-y-auto border border-border rounded-md bg-surface-0 p-1.5 space-y-1">
                        {selectedImageUrls.map((url, index) => {
                          const imgObj = pendingImages.find(i => i.url === url)
                          const name = imgObj ? imgObj.filename : url.split('/').pop() || 'image.jpg'
                          return (
                            <div key={index} className="flex items-center justify-between text-3xs bg-surface-2 px-2 py-1 rounded font-mono text-ink-secondary">
                              <span className="truncate max-w-[200px]" title={url}>{name}</span>
                              <button
                                type="button"
                                onClick={() => toggleSelectImage(url)}
                                className="text-ink-muted hover:text-red-500"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Progress / Status display */}
          <div className="space-y-4 pt-4 border-t border-border">
            {isIndexingRun ? (
              <div className="space-y-2.5 p-3.5 bg-accent-50/10 border border-accent-100 rounded-xl">
                <div className="flex items-center justify-between text-xs font-semibold text-accent-700">
                  <span className="flex items-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Đang xử lý ảnh: {indexingStats.processed} / {indexingStats.total}
                  </span>
                  <span>
                    {Math.round((indexingStats.processed / indexingStats.total) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-surface-1 rounded-full h-3 border border-border overflow-hidden">
                  <div
                    className="bg-accent-600 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${(indexingStats.processed / indexingStats.total) * 100}%` }}
                  />
                </div>
                <div className="text-3xs text-ink-muted flex justify-between">
                  <span>Batch hiện tại: {indexingStats.currentBatch} / {indexingStats.totalBatches}</span>
                  <span>(Phân bổ 500 ảnh mỗi batch)</span>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleRunIndexing}
                disabled={isUploading || isIndexingRun || (indexingScope === 'selected' && selectedImageUrls.length === 0) || (indexingScope === 'all' && pendingImages.length === 0)}
                className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-accent-600 hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
              >
                <Play className="h-4 w-4 fill-current" />
                <span>
                  Bắt đầu chạy Indexing (
                  {indexingScope === 'all' ? pendingImages.length : selectedImageUrls.length} ảnh
                  )
                </span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* LỊCH SỬ CÁC ĐỢT INDEXING */}
      <div className="bg-surface-2 rounded-xl border border-border shadow-2xs p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-ink-muted" />
            <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
              Lịch sử các đợt Indexing trên hệ thống
            </h2>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-3xs text-ink-muted">Polling tiến trình tự động mỗi 5s</span>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-surface-1/40 border-b border-border text-ink-muted uppercase font-bold tracking-wider">
                <th className="px-6 py-3 font-semibold">Mã Batch</th>
                <th className="px-6 py-3 font-semibold">Trạng thái</th>
                <th className="px-6 py-3 font-semibold">Tổng số ảnh</th>
                <th className="px-6 py-3 font-semibold">Đã xử lý</th>
                <th className="px-6 py-3 font-semibold">Bị lỗi</th>
                <th className="px-6 py-3 font-semibold">Thời gian tạo</th>
                <th className="px-6 py-3 font-semibold">Chi tiết lỗi</th>
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
                    Chưa có lịch sử đợt indexing nào.
                  </td>
                </tr>
              ) : (
                batches.map((b) => (
                  <tr key={b.id} className="text-ink-secondary hover:bg-surface-1/5 transition-colors">
                    <td className="px-6 py-4 font-mono font-medium text-ink-primary">{b.batch_id}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-3xs font-semibold ${
                        b.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' :
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
    </PageContainer>
  )
}
