import { useEffect, useState } from 'react'
import { Database, Loader2 } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { adminApi, type IndexingBatch } from '@/lib/api/admin'

const POLL_INTERVAL_MS = 5_000

export function AdminIndexingIndicator() {
  const location = useLocation()
  const [activeBatch, setActiveBatch] = useState<IndexingBatch | null>(null)

  useEffect(() => {
    let disposed = false

    const load = async () => {
      try {
        const batches = await adminApi.getIndexingBatches()
        if (!disposed) {
          setActiveBatch(
            batches.find((batch) =>
              batch.is_uploading || batch.status === 'queued' || batch.status === 'running'
            ) ?? null
          )
        }
      } catch {
        // The page-level error handler remains the source for actionable errors.
      }
    }

    void load()
    const intervalId = window.setInterval(load, POLL_INTERVAL_MS)
    return () => {
      disposed = true
      window.clearInterval(intervalId)
    }
  }, [])

  if (!activeBatch || location.pathname === '/admin/indexing') return null

  const semanticFinished = activeBatch.processed_images + activeBatch.failed_images
  const semanticProgress = activeBatch.total_images > 0
    ? Math.min(100, Math.round((semanticFinished / activeBatch.total_images) * 100))
    : 0
  const ocrTarget = Math.max(activeBatch.processed_images, activeBatch.total_images - activeBatch.failed_images)
  const ocrFinished = activeBatch.ocr_processed_images + activeBatch.ocr_failed_images
  const ocrProgress = ocrTarget > 0
    ? Math.min(100, Math.round((ocrFinished / ocrTarget) * 100))
    : 0

  return (
    <Link
      to="/admin/indexing"
      className="fixed bottom-4 right-4 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-border bg-white/95 p-3 shadow-lg backdrop-blur transition hover:-translate-y-0.5"
      title="Mở trang tiến độ indexing"
    >
      <div className="flex items-center gap-2 text-xs font-semibold text-ink-primary">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
          <Database className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Loader2 className="h-3.5 w-3.5 animate-spin text-accent-600" />
            <span>Indexing vẫn đang chạy nền</span>
          </div>
          <p className="mt-0.5 truncate font-mono text-3xs font-normal text-ink-muted">
            {activeBatch.batch_id}
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-3xs text-ink-muted">
        <div>
          <div className="mb-1 flex justify-between"><span>CLIP</span><span>{semanticProgress}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-1">
            <div className="h-full rounded-full bg-amber-500" style={{ width: `${semanticProgress}%` }} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex justify-between"><span>OCR</span><span>{ocrProgress}%</span></div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface-1">
            <div className="h-full rounded-full bg-blue-500" style={{ width: `${ocrProgress}%` }} />
          </div>
        </div>
      </div>
    </Link>
  )
}
