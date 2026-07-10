import { useEffect, useState, useRef } from 'react'
import { Database, Play, Loader2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react'
import { PageContainer } from '@/components/layout/PageContainer'
import { adminApi, type IndexingStatus } from '@/lib/api/admin'

export default function AdminIndexingPage() {
  const [status, setStatus] = useState<IndexingStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTriggering, setIsTriggering] = useState(false)
  const [batchSize, setBatchSize] = useState<number>(500)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)
  
  const pollingRef = useRef<number | null>(null)

  // Hàm load status từ API
  const fetchStatus = async (showLoadingIndicator = false) => {
    if (showLoadingIndicator) setIsLoading(true)
    try {
      const data = await adminApi.getIndexingStatus()
      setStatus(data)
    } catch (err) {
      console.error('Lỗi khi fetch indexing status:', err)
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
      // Cập nhật lại status ngay lập tức để chuyển sang trạng thái running
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
        {/* Trigger indexing form */}
        <div className="bg-surface-2 rounded-xl border border-border shadow-2xs p-5 space-y-4 md:col-span-1">
          <h2 className="text-sm font-bold text-ink-primary uppercase tracking-wide">
            Kích hoạt Indexing mới
          </h2>
          <p className="text-xs text-ink-muted">
            Quét thư mục ảnh mới tải lên, chạy trích xuất CLIP embeddings và đưa vào cơ sở dữ liệu vector.
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
                disabled={status?.status === 'running' || isTriggering}
                className="w-full rounded-lg border border-border bg-surface-1 px-3 py-2 text-sm text-ink-primary focus:border-accent-600 focus:outline-none disabled:opacity-50 disabled:bg-surface-0 transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={status?.status === 'running' || isTriggering || batchSize <= 0}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-semibold text-white bg-ink-primary hover:bg-accent-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-xs cursor-pointer"
            >
              {isTriggering ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang kết nối...</span>
                </>
              ) : status?.status === 'running' ? (
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
              {status.status === 'running' && (
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
    </PageContainer>
  )
}
