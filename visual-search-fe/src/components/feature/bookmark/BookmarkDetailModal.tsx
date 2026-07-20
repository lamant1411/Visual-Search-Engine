import { useEffect, useRef, useState } from 'react'
import { X, ImageIcon, FileText, AlertCircle, Loader2, ExternalLink } from 'lucide-react'
import { bookmarkApi, type BookmarkDetail } from '@/lib/api/bookmark'

// ── Hook fetch detail ─────────────────────────────────────────────

function useBookmarkDetail(id: number | null) {
  const [detail, setDetail] = useState<BookmarkDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (id === null) {
      setDetail(null)
      return
    }
    let cancelled = false
    setIsLoading(true)
    setError(null)

    bookmarkApi
      .detail(id)
      .then((data) => { if (!cancelled) setDetail(data) })
      .catch(() => { if (!cancelled) setError('Không thể tải thông tin chi tiết.') })
      .finally(() => { if (!cancelled) setIsLoading(false) })

    return () => { cancelled = true }
  }, [id])

  return { detail, isLoading, error }
}

// ── Row metadata ──────────────────────────────────────────────────

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b border-border last:border-0">
      <span className="text-xs font-semibold text-ink-muted uppercase tracking-wide shrink-0">{label}</span>
      <span className="text-xs text-ink-secondary text-right">{value}</span>
    </div>
  )
}

// ── Modal ─────────────────────────────────────────────────────────

export interface BookmarkDetailModalProps {
  /** ID bookmark đang xem; null = đóng modal */
  bookmarkId: number | null
  onClose: () => void
}

export function BookmarkDetailModal({ bookmarkId, onClose }: BookmarkDetailModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null)
  const { detail, isLoading, error } = useBookmarkDetail(bookmarkId)

  // Đóng bằng Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // Khoá scroll body khi modal mở
  useEffect(() => {
    if (bookmarkId !== null) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [bookmarkId])

  if (bookmarkId === null) return null

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose()
  }

  return (
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết ảnh"
        className="relative w-full max-w-4xl max-h-[90vh] bg-surface-2 rounded-2xl shadow-2xl overflow-hidden flex flex-col sm:flex-row animate-in zoom-in-95 duration-200"
      >
        {/* Nút đóng */}
        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="absolute top-3 right-3 z-10 flex items-center justify-center w-8 h-8 rounded-full bg-black/40 hover:bg-black/60 text-white transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* ── Cột ảnh ── */}
        <div className="sm:w-[60%] bg-surface-1 flex items-center justify-center min-h-[260px] sm:min-h-0">
          {isLoading ? (
            <Loader2 className="w-8 h-8 text-ink-muted animate-spin" />
          ) : error ? (
            <div className="flex flex-col items-center gap-2 p-6 text-center">
              <AlertCircle className="w-6 h-6 text-red-400" />
              <p className="text-sm text-ink-secondary">{error}</p>
            </div>
          ) : detail ? (
            <img
              src={detail.image_url.replace(/\?.*$/, '?w=1200&q=90')}
              alt={detail.title}
              className="w-full h-full object-contain max-h-[60vh] sm:max-h-[90vh]"
            />
          ) : null}
        </div>

        {/* ── Cột metadata ── */}
        <div className="sm:w-[40%] flex flex-col overflow-y-auto">
          {detail && (
            <>
              {/* Header */}
              <div className="px-5 py-4 border-b border-border">
                <h2 className="text-base font-bold text-ink-primary leading-snug">
                  {detail.title}
                </h2>
                <p className="text-xs text-ink-muted mt-1">
                  Lưu lúc {new Date(detail.saved_at).toLocaleString('vi-VN')}
                </p>
              </div>

              {/* Metadata */}
              <div className="px-5 py-4 border-b border-border">
                <div className="flex items-center gap-1.5 mb-3">
                  <ImageIcon className="w-3.5 h-3.5 text-ink-muted" />
                  <span className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">
                    Thông tin ảnh
                  </span>
                </div>
                <MetaRow label="Kích thước" value={`${detail.width} × ${detail.height} px`} />
                <MetaRow label="Nguồn" value={detail.source} />
                <MetaRow
                  label="URL"
                  value={new URL(detail.image_url).hostname}
                />
                <div className="mt-2">
                  <a
                    href={detail.image_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-accent-600 hover:text-ink-primary font-medium transition-colors"
                  >
                    <ExternalLink className="w-3 h-3" />
                    Mở ảnh gốc
                  </a>
                </div>
              </div>

              {/* OCR text */}
              <div className="px-5 py-4 flex-1">
                <div className="flex items-center gap-1.5 mb-3">
                  <FileText className="w-3.5 h-3.5 text-ink-muted" />
                  <span className="text-xs font-semibold text-ink-secondary uppercase tracking-wide">
                    Văn bản OCR
                  </span>
                </div>
                {detail.ocr_text ? (
                  <pre className="text-xs text-ink-primary bg-surface-1 rounded-lg px-3 py-3 whitespace-pre-wrap break-words leading-relaxed font-mono border border-border">
                    {detail.ocr_text}
                  </pre>
                ) : (
                  <p className="text-xs text-ink-muted italic">
                    Không có văn bản được phát hiện trong ảnh này.
                  </p>
                )}
              </div>
            </>
          )}

          {/* Loading skeleton cho cột phải */}
          {isLoading && (
            <div className="px-5 py-4 space-y-4 animate-pulse">
              <div className="h-4 bg-surface-1 rounded w-3/4" />
              <div className="h-3 bg-surface-1 rounded w-1/2" />
              <div className="h-px bg-border my-2" />
              <div className="space-y-2">
                <div className="h-3 bg-surface-1 rounded" />
                <div className="h-3 bg-surface-1 rounded" />
                <div className="h-3 bg-surface-1 rounded w-2/3" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
