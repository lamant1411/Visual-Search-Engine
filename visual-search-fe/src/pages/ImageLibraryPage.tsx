import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { AlertCircle, CheckSquare, Images, Loader2, RefreshCw, RotateCcw, Trash2, Undo2, Upload, X } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/base/button'
import { PageContainer } from '@/components/layout/PageContainer'
import { useAuth } from '@/contexts/AuthContext'
import { ResultGrid, ResultGridSkeleton } from '@/features/search/components/ResultGrid'
import { SearchResultDetailModal } from '@/features/search/components/SearchResultDetailModal'
import { useBookmarks } from '@/features/search/hooks/useBookmarks'
import type { SearchResult } from '@/features/search/types'
import {
  createImageSearchHistoryKey,
  saveImageSearchFile,
} from '@/features/search/utils/imageSearchSession'
import { adminApi, type AdminIndexingItem } from '@/lib/api/admin'
import { imageLibraryApi } from '@/lib/api/images'

const IMAGE_LIBRARY_PAGE_LIMIT = 20
const MAX_IMAGE_UPLOAD_FILE_BYTES = 10 * 1024 * 1024
const MAX_IMAGE_UPLOAD_CHUNK_BYTES = 100 * 1024 * 1024

function splitFilesIntoUploadChunks(files: File[]): File[][] {
  const chunks: File[][] = []
  let currentChunk: File[] = []
  let currentChunkBytes = 0

  for (const file of files) {
    if (file.size > MAX_IMAGE_UPLOAD_FILE_BYTES) {
      throw new Error(`Image "${file.name}" is larger than 10MB.`)
    }

    if (currentChunk.length > 0 && currentChunkBytes + file.size > MAX_IMAGE_UPLOAD_CHUNK_BYTES) {
      chunks.push(currentChunk)
      currentChunk = []
      currentChunkBytes = 0
    }

    currentChunk.push(file)
    currentChunkBytes += file.size
  }

  if (currentChunk.length > 0) {
    chunks.push(currentChunk)
  }

  return chunks
}

function isSupportedImageFile(file: File) {
  return ['image/jpeg', 'image/png', 'image/webp'].includes(file.type)
}

type LibraryViewMode = 'indexed' | 'deleted'
type BatchItemStatusFilter = 'all' | AdminIndexingItem['status']

const batchStatusFilters: Array<{ label: string; value: BatchItemStatusFilter }> = [
  { label: 'All', value: 'all' },
  { label: 'Indexed', value: 'indexed' },
  { label: 'Failed', value: 'failed' },
  { label: 'Queued', value: 'queued' },
  { label: 'Running', value: 'running' },
]

export default function ImageLibraryPage() {
  const navigate = useNavigate()
  const loadMoreRef = useRef<HTMLDivElement | null>(null)
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [viewMode, setViewMode] = useState<LibraryViewMode>('indexed')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [batchStatusFilter, setBatchStatusFilter] = useState<BatchItemStatusFilter>('all')
  const { user } = useAuth()
  const { isBookmarked, toggleBookmark, isToggling } = useBookmarks()
  const [mutatingImageId, setMutatingImageId] = useState<number | null>(null)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(() => new Set())
  const [isBulkMutating, setIsBulkMutating] = useState(false)
  const [selectedUploadFiles, setSelectedUploadFiles] = useState<File[]>([])
  const [isUploadingImages, setIsUploadingImages] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatusMessage, setUploadStatusMessage] = useState<string | null>(null)
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null)
  const canManageImages = Boolean(user)
  const isDeletedView = viewMode === 'deleted'
  const isBatchView = canManageImages && !isDeletedView && Boolean(selectedBatchId)

  const batchesQuery = useQuery({
    queryKey: ['image-library-batches'],
    queryFn: adminApi.getIndexingBatches,
    enabled: canManageImages,
  })

  const listQuery = useInfiniteQuery({
    queryKey: ['image-library', viewMode, selectedBatchId, batchStatusFilter],
    queryFn: ({ pageParam = 1 }) => {
      if (isBatchView) {
        return adminApi
          .listIndexingItems(selectedBatchId, {
            status: batchStatusFilter === 'all' ? undefined : batchStatusFilter,
            page: pageParam as number,
            limit: IMAGE_LIBRARY_PAGE_LIMIT,
          })
          .then((response) => ({
            ...response,
            items: response.items.map(mapIndexingItemToSearchResult),
          }))
      }

      const params = {
        page: pageParam as number,
        limit: IMAGE_LIBRARY_PAGE_LIMIT,
      }
      return isDeletedView ? imageLibraryApi.listDeleted(params) : imageLibraryApi.list(params)
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage, allPages) => {
      const loadedCount = allPages.reduce((sum, page) => sum + page.items.length, 0)
      if (lastPage.items.length < IMAGE_LIBRARY_PAGE_LIMIT || loadedCount >= lastPage.total) {
        return undefined
      }
      return allPages.length + 1
    },
  })

  const fetchNextImagePage = listQuery.fetchNextPage

  useEffect(() => {
    const target = loadMoreRef.current
    if (!target || !listQuery.hasNextPage) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !listQuery.isFetchingNextPage) {
          void fetchNextImagePage()
        }
      },
      { rootMargin: '500px 0px' },
    )

    observer.observe(target)
    return () => observer.disconnect()
  }, [fetchNextImagePage, listQuery.hasNextPage, listQuery.isFetchingNextPage])

  const rawResults = useMemo(
    () => (listQuery.data?.pages ?? []).flatMap((page) => page.items),
    [listQuery.data],
  )
  const results = rawResults
  const total = listQuery.data?.pages[0]?.total ?? 0
  const selectedCount = selectedImageIds.size


  function handleUploadFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []).filter(isSupportedImageFile)
    if (files.length > 0) {
      setSelectedUploadFiles((current) => [...current, ...files])
      setUploadErrorMessage(null)
      setUploadStatusMessage(null)
    }
    event.target.value = ''
  }

  function handleRemoveUploadFile(index: number) {
    setSelectedUploadFiles((current) => current.filter((_, currentIndex) => currentIndex !== index))
  }

  function handleClearUploadFiles() {
    setSelectedUploadFiles([])
    setUploadProgress(0)
    setUploadErrorMessage(null)
    setUploadStatusMessage(null)
  }

  async function handleUploadSelectedFiles() {
    if (selectedUploadFiles.length === 0 || isUploadingImages) return

    const filesToUpload = [...selectedUploadFiles]
    setIsUploadingImages(true)
    setUploadProgress(0)
    setUploadErrorMessage(null)
    setUploadStatusMessage('Creating upload batch...')

    let batchId: string | null = null
    try {
      const chunks = splitFilesIntoUploadChunks(filesToUpload)
      const batch = await adminApi.createIndexingBatch()
      batchId = batch.batch_id
      let uploadedFiles = 0

      for (const chunk of chunks) {
        await adminApi.uploadImagesToBatch(batch.batch_id, chunk, (chunkPercent) => {
          const currentChunkFiles = (chunkPercent / 100) * chunk.length
          const totalUploadedFiles = Math.min(filesToUpload.length, uploadedFiles + currentChunkFiles)
          setUploadProgress(Math.round((totalUploadedFiles / filesToUpload.length) * 100))
        })
        uploadedFiles += chunk.length
        setUploadProgress(Math.round((uploadedFiles / filesToUpload.length) * 100))
        setUploadStatusMessage(`Uploaded ${uploadedFiles}/${filesToUpload.length} image(s). Indexing is running in background...`)
      }

      await adminApi.completeIndexingBatch(batch.batch_id)
      setUploadProgress(100)
      setUploadStatusMessage('Upload completed. Images will appear after indexing finishes.')
      setSelectedUploadFiles([])
      await Promise.all([listQuery.refetch(), batchesQuery.refetch()])
    } catch (error) {
      if (batchId) {
        try {
          await adminApi.completeIndexingBatch(batchId)
        } catch (completeError) {
          console.error('[ImageLibraryPage] Complete upload after failure failed', completeError)
        }
      }
      const message = error instanceof Error ? error.message : 'Unable to upload selected images.'
      setUploadErrorMessage(message)
      setUploadStatusMessage(null)
      console.error('[ImageLibraryPage] Upload selected images failed', error)
    } finally {
      setIsUploadingImages(false)
    }
  }

  function handleChangeViewMode(nextMode: LibraryViewMode) {
    setViewMode(nextMode)
    setSelectedResult(null)
    setSelectedBatchId('')
    setBatchStatusFilter('all')
    handleClearSelectedImages()
  }

  function handleSelectBatch(batchId: string) {
    setViewMode('indexed')
    setSelectedBatchId(batchId)
    setBatchStatusFilter('all')
    setSelectedResult(null)
    handleClearSelectedImages()
  }

  function handleClearBatch() {
    setSelectedBatchId('')
    setBatchStatusFilter('all')
    handleClearSelectedImages()
  }

  function handleChangeBatchStatus(nextStatus: BatchItemStatusFilter) {
    setBatchStatusFilter(nextStatus)
    setSelectedResult(null)
    handleClearSelectedImages()
  }

  function handleToggleSelect(result: SearchResult) {
    setSelectedImageIds((current) => {
      const next = new Set(current)
      if (next.has(result.id)) {
        next.delete(result.id)
      } else {
        next.add(result.id)
      }
      return next
    })
  }

  function handleSelectVisibleImages() {
    setSelectedImageIds((current) => {
      const next = new Set(current)
      for (const result of rawResults) {
        next.add(result.id)
      }
      return next
    })
  }

  function handleClearSelectedImages() {
    setSelectedImageIds(new Set())
  }

  async function handleSoftDeleteSelectedImages() {
    const imageIds = Array.from(selectedImageIds)
    if (imageIds.length === 0 || isBulkMutating) return
    if (!confirm(`Move ${imageIds.length} selected image(s) to deleted images?`)) return

    setIsBulkMutating(true)
    try {
      const result = await imageLibraryApi.bulkDelete(imageIds)
      removeSelectedIds(result.deleted_items.map((item) => item.image_id))
      await listQuery.refetch()
      if (result.failed_count > 0) {
        alert(`Moved ${result.deleted_count} image(s). Failed to move ${result.failed_count} image(s).`)
      }
    } catch (error) {
      console.error('[ImageLibraryPage] Soft delete selected images failed', error)
      alert('Unable to move selected images to deleted images. Check the API response or backend logs.')
    } finally {
      setIsBulkMutating(false)
    }
  }

  async function handleRestoreSelectedImages() {
    const imageIds = Array.from(selectedImageIds)
    if (imageIds.length === 0 || isBulkMutating) return

    setIsBulkMutating(true)
    try {
      const result = await imageLibraryApi.bulkRestore(imageIds)
      removeSelectedIds(result.restored_items.map((item) => item.image_id))
      await listQuery.refetch()
      if (result.failed_count > 0) {
        alert(`Restored ${result.restored_count} image(s). Failed to restore ${result.failed_count} image(s).`)
      }
    } catch (error) {
      console.error('[ImageLibraryPage] Restore selected images failed', error)
      alert('Unable to restore selected images. Check the API response or backend logs.')
    } finally {
      setIsBulkMutating(false)
    }
  }

  async function handlePermanentDeleteSelectedImages() {
    const imageIds = Array.from(selectedImageIds)
    if (imageIds.length === 0 || isBulkMutating) return
    if (!confirm(`Permanently delete ${imageIds.length} selected image(s)? This cannot be undone.`)) return

    setIsBulkMutating(true)
    try {
      const result = await imageLibraryApi.bulkPermanentDelete(imageIds)
      removeSelectedIds(result.deleted_items.map((item) => item.image_id))
      await listQuery.refetch()
      if (result.failed_count > 0) {
        alert(`Deleted ${result.deleted_count} image(s). Failed to delete ${result.failed_count} image(s).`)
      }
    } catch (error) {
      console.error('[ImageLibraryPage] Permanently delete selected images failed', error)
      alert('Unable to permanently delete selected images. Check the API response or backend logs.')
    } finally {
      setIsBulkMutating(false)
    }
  }

  function removeSelectedIds(imageIds: number[]) {
    const changedIds = new Set(imageIds)
    setSelectedImageIds((current) => {
      const next = new Set(current)
      for (const imageId of changedIds) {
        next.delete(imageId)
      }
      return next
    })
    if (selectedResult && changedIds.has(selectedResult.id)) {
      setSelectedResult(null)
    }
  }

  function handleBookmark(result: SearchResult) {
    if (isToggling || isDeletedView) return
    toggleBookmark(result.id)
  }

  async function handleSoftDeleteSelectedImage() {
    if (!selectedResult || mutatingImageId) return
    if (!confirm('Move this image to deleted images? You can restore it later.')) return

    setMutatingImageId(selectedResult.id)
    try {
      await imageLibraryApi.delete(selectedResult.id)
      setSelectedResult(null)
      await listQuery.refetch()
    } catch (error) {
      console.error('[ImageLibraryPage] Soft delete image failed', error)
      alert('Unable to move this image to deleted images. Check the API response or backend logs.')
    } finally {
      setMutatingImageId(null)
    }
  }

  async function handleRestoreSelectedImage() {
    if (!selectedResult || mutatingImageId) return

    setMutatingImageId(selectedResult.id)
    try {
      await imageLibraryApi.restore(selectedResult.id)
      setSelectedResult(null)
      await listQuery.refetch()
    } catch (error) {
      console.error('[ImageLibraryPage] Restore image failed', error)
      alert('Unable to restore this image. Check the API response or backend logs.')
    } finally {
      setMutatingImageId(null)
    }
  }

  async function handlePermanentDeleteSelectedImage() {
    if (!selectedResult || mutatingImageId) return
    if (!confirm('Permanently delete this image? This cannot be undone.')) return

    setMutatingImageId(selectedResult.id)
    try {
      await imageLibraryApi.permanentDelete(selectedResult.id)
      setSelectedResult(null)
      await listQuery.refetch()
    } catch (error) {
      console.error('[ImageLibraryPage] Permanently delete image failed', error)
      alert('Unable to permanently delete this image. Check the API response or backend logs.')
    } finally {
      setMutatingImageId(null)
    }
  }

  async function handleFindSimilar(result: SearchResult, file?: File) {
    setSelectedResult(null)

    if (file) {
      const historyKey = createImageSearchHistoryKey()
      await saveImageSearchFile(historyKey, file)
      navigate(
        `/search/results?mode=image&page=1&limit=20&historyKey=${encodeURIComponent(historyKey)}`,
        { state: { file, fileName: file.name, historyKey } },
      )
      return
    }

    navigate(`/search/results?mode=image&imageId=${result.id}&page=1&limit=20`)
  }

  const isInitialLoading = listQuery.isLoading
  const hasResults = results.length > 0
  const loadedCount = results.length
  const selectedVisibleCount = rawResults.filter((result) => selectedImageIds.has(result.id)).length
  const batches = batchesQuery.data ?? []
  const batchesWithImages = batches.filter((batch) => batch.total_images > 0)
  const selectedBatch = batches.find((batch) => batch.batch_id === selectedBatchId)
  const modeTitle = isBatchView ? 'Batch images' : isDeletedView ? 'Deleted images' : 'Indexed images'
  const modeDescription = isBatchView && selectedBatch
    ? `Review images from batch ${selectedBatch.batch_id}.`
    : isDeletedView
    ? 'Review soft-deleted images, restore them, or permanently remove them from the system.'
    : 'Browse indexed images that are ready for text and image-to-image search.'

  function renderSelectedImageManagementAction() {
    if (!canManageImages || !selectedResult) {
      return undefined
    }

    if (isDeletedView) {
      return (
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            disabled={mutatingImageId === selectedResult.id}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-border bg-white px-4 py-2.5 text-sm font-bold text-ink-primary transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handleRestoreSelectedImage}
          >
            <Undo2 className="h-4 w-4" />
            {mutatingImageId === selectedResult.id ? 'Restoring...' : 'Restore image'}
          </button>
          <button
            type="button"
            disabled={mutatingImageId === selectedResult.id}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
            onClick={handlePermanentDeleteSelectedImage}
          >
            <Trash2 className="h-4 w-4" />
            {mutatingImageId === selectedResult.id ? 'Deleting...' : 'Delete permanently'}
          </button>
        </div>
      )
    }

    return (
      <button
        type="button"
        disabled={mutatingImageId === selectedResult.id}
        className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-60"
        onClick={handleSoftDeleteSelectedImage}
      >
        <Trash2 className="h-4 w-4" />
        {mutatingImageId === selectedResult.id ? 'Moving...' : 'Move to deleted'}
      </button>
    )
  }

  return (
    <>
      <PageContainer size="wide" className="space-y-6 py-5 sm:py-8">
        <header className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm shadow-slate-200/60">
          <div className="flex flex-col gap-5 p-5 sm:p-6 lg:flex-row lg:items-start lg:justify-between">
            <div className="flex min-w-0 gap-4">
              <div className="hidden h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-white shadow-sm sm:flex">
                <Images className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-wide text-accent-600">Image library</p>
                <div className="mt-2 flex flex-wrap items-center gap-3">
                  <h1 className="font-display text-2xl font-bold tracking-tight text-ink-primary sm:text-3xl">
                    {modeTitle}
                  </h1>
                  <span className={[
                    'inline-flex min-h-8 items-center rounded-full border px-3 text-xs font-bold shadow-sm',
                    isBatchView
                      ? 'border-violet-100 bg-violet-50 text-violet-700'
                      : isDeletedView
                      ? 'border-red-100 bg-red-50 text-red-700'
                      : 'border-blue-100 bg-blue-50 text-blue-700',
                  ].join(' ')}>
                    {isBatchView ? 'Batch view' : isDeletedView ? 'Trash view' : 'Search ready'}
                  </span>
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
                  {modeDescription}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-surface-1/40 lg:min-w-[420px]">
              <LibraryMetric label="Total" value={isInitialLoading ? '...' : total.toLocaleString('vi-VN')} />
              <LibraryMetric label="Loaded" value={loadedCount.toLocaleString('vi-VN')} />
              <LibraryMetric label="Selected" value={selectedCount.toLocaleString('vi-VN')} />
            </div>
          </div>
        </header>


        <section className="rounded-2xl border border-border bg-white p-4 shadow-sm shadow-slate-200/60 sm:p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-ink-primary">Upload to your library</p>
              <p className="mt-1 text-xs leading-5 text-ink-secondary">
                Add JPG, PNG, or WebP images to your private library. Each image must be 10MB or less; large selections are uploaded in 100MB chunks.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                ref={uploadInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={handleUploadFileChange}
              />
              <Button
                type="button"
                variant="outline"
                className="min-h-11 rounded-xl"
                leftIcon={<Upload className="h-4 w-4" />}
                disabled={isUploadingImages}
                onClick={() => uploadInputRef.current?.click()}
              >
                Choose images
              </Button>
              <Button
                type="button"
                className="min-h-11 rounded-xl"
                leftIcon={isUploadingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                disabled={selectedUploadFiles.length === 0 || isUploadingImages}
                onClick={handleUploadSelectedFiles}
              >
                {isUploadingImages ? 'Uploading...' : 'Upload and index'}
              </Button>
            </div>
          </div>

          {(selectedUploadFiles.length > 0 || uploadStatusMessage || uploadErrorMessage) && (
            <div className="mt-4 space-y-3 rounded-2xl border border-border bg-surface-1/40 p-4">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-bold text-ink-primary">
                  {selectedUploadFiles.length.toLocaleString('vi-VN')} selected image(s)
                </p>
                {selectedUploadFiles.length > 0 && !isUploadingImages && (
                  <button
                    type="button"
                    className="text-xs font-bold text-ink-secondary underline underline-offset-2 hover:text-ink-primary"
                    onClick={handleClearUploadFiles}
                  >
                    Clear selection
                  </button>
                )}
              </div>

              {selectedUploadFiles.length > 0 && (
                <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto pr-1">
                  {selectedUploadFiles.map((file, index) => (
                    <span
                      key={`${file.name}-${file.lastModified}-${index}`}
                      className="inline-flex max-w-full items-center gap-2 rounded-full border border-border bg-white px-3 py-1.5 text-xs font-semibold text-ink-secondary"
                    >
                      <span className="max-w-48 truncate">{file.name}</span>
                      {!isUploadingImages && (
                        <button
                          type="button"
                          className="rounded-full p-0.5 text-ink-muted hover:bg-surface-1 hover:text-ink-primary"
                          aria-label={`Remove ${file.name}`}
                          onClick={() => handleRemoveUploadFile(index)}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </span>
                  ))}
                </div>
              )}

              {(isUploadingImages || uploadProgress > 0) && (
                <div className="space-y-1.5">
                  <div className="h-2 overflow-hidden rounded-full bg-white">
                    <div
                      className="h-full rounded-full bg-accent-600 transition-all"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-xs font-semibold text-ink-secondary">{uploadProgress}%</p>
                </div>
              )}

              {uploadStatusMessage && (
                <p className="rounded-xl border border-emerald-100 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
                  {uploadStatusMessage}
                </p>
              )}

              {uploadErrorMessage && (
                <p className="rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
                  {uploadErrorMessage}
                </p>
              )}
            </div>
          )}
        </section>

        {canManageImages && (
          <section className="rounded-2xl border border-border bg-white p-4 shadow-sm shadow-slate-200/60 sm:p-5">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <p className="text-sm font-bold text-ink-primary">Indexing batches</p>
                <p className="mt-1 text-xs leading-5 text-ink-secondary">
                  Select one upload batch to review only the images created in that indexing run.
                </p>
              </div>

              <div className="flex min-w-0 flex-col gap-2 sm:flex-row lg:min-w-[520px]">
                <label className="min-w-0 flex-1">
                  <span className="sr-only">Select indexing batch</span>
                  <select
                    className="h-12 w-full rounded-xl border border-border bg-white px-4 text-sm font-bold text-ink-primary outline-none transition focus:border-accent-600 focus:ring-4 focus:ring-accent-100"
                    value={selectedBatchId}
                    onChange={(event) => handleSelectBatch(event.target.value)}
                  >
                    <option value="">All indexed images</option>
                    {batchesWithImages.map((batch) => (
                      <option key={batch.batch_id} value={batch.batch_id}>
                        {batch.batch_id} · {batch.processed_images}/{batch.total_images} indexed
                      </option>
                    ))}
                  </select>
                </label>

                {isBatchView && (
                  <Button
                    type="button"
                    variant="outline"
                    className="h-12 rounded-xl"
                    leftIcon={<X className="h-4 w-4" />}
                    onClick={handleClearBatch}
                  >
                    Clear batch
                  </Button>
                )}
              </div>
            </div>

            {batchesQuery.isLoading && (
              <p className="mt-4 rounded-xl bg-surface-1 px-4 py-3 text-sm font-semibold text-ink-secondary">
                Loading indexing batches...
              </p>
            )}

            {batchesQuery.isError && (
              <p className="mt-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
                Unable to load indexing batches.
              </p>
            )}

            {isBatchView && selectedBatch && (
              <div className="mt-4 space-y-4">
                <div className="grid overflow-hidden rounded-2xl border border-border bg-surface-1/40 sm:grid-cols-4">
                  <LibraryMetric label="Batch status" value={selectedBatch.status.toUpperCase()} />
                  <LibraryMetric label="Total" value={selectedBatch.total_images.toLocaleString('vi-VN')} />
                  <LibraryMetric label="Indexed" value={selectedBatch.processed_images.toLocaleString('vi-VN')} />
                  <LibraryMetric label="Failed" value={selectedBatch.failed_images.toLocaleString('vi-VN')} />
                </div>

                <div className="flex flex-wrap gap-2">
                  {batchStatusFilters.map((filter) => (
                    <button
                      key={filter.value}
                      type="button"
                      aria-pressed={batchStatusFilter === filter.value}
                      className={[
                        'inline-flex min-h-10 items-center rounded-full border px-4 text-xs font-bold transition',
                        batchStatusFilter === filter.value
                          ? 'border-slate-950 bg-slate-950 text-white shadow-sm'
                          : 'border-border bg-white text-ink-secondary hover:bg-surface-1 hover:text-ink-primary',
                      ].join(' ')}
                      onClick={() => handleChangeBatchStatus(filter.value)}
                    >
                      {filter.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

        <section className="sticky top-16 z-30 -mx-4 border-y border-border bg-surface-0/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:bg-white sm:p-3 sm:shadow-sm sm:shadow-slate-200/60">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-surface-1 p-1 sm:inline-grid sm:w-fit">
              <button
                type="button"
                aria-pressed={!isDeletedView}
                className={[
                  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold transition',
                  !isDeletedView
                    ? 'bg-white text-ink-primary shadow-sm ring-1 ring-border'
                    : 'text-ink-secondary hover:bg-white/70 hover:text-ink-primary',
                ].join(' ')}
                onClick={() => handleChangeViewMode('indexed')}
              >
                Indexed
              </button>
              <button
                type="button"
                aria-pressed={isDeletedView}
                className={[
                  'inline-flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold transition',
                  isDeletedView
                    ? 'bg-white text-ink-primary shadow-sm ring-1 ring-border'
                    : 'text-ink-secondary hover:bg-white/70 hover:text-ink-primary',
                ].join(' ')}
                onClick={() => handleChangeViewMode('deleted')}
              >
                Deleted
              </button>
            </div>

            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
              <Button
                aria-label="Refresh image library"
                type="button"
                variant="outline"
                className="min-h-11 rounded-xl"
                leftIcon={<RefreshCw className={listQuery.isFetching ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />}
                onClick={() => void listQuery.refetch()}
              >
                Refresh
              </Button>

              {canManageImages && (
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 rounded-xl"
                  leftIcon={<CheckSquare className="h-4 w-4" />}
                  onClick={handleSelectVisibleImages}
                >
                  Select visible
                </Button>
              )}

              {canManageImages && selectedCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 rounded-xl"
                  leftIcon={<X className="h-4 w-4" />}
                  onClick={handleClearSelectedImages}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </section>

        {canManageImages && selectedCount > 0 && (
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-white p-4 shadow-sm shadow-slate-200/70 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-sm font-bold text-ink-primary">
                {selectedCount.toLocaleString('vi-VN')} selected
              </p>
              <p className="mt-1 text-xs text-ink-secondary">
                {selectedVisibleCount.toLocaleString('vi-VN')} selected from the current loaded view.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
              {isDeletedView ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 rounded-xl"
                    disabled={isBulkMutating}
                    leftIcon={<Undo2 className="h-4 w-4" />}
                    onClick={handleRestoreSelectedImages}
                  >
                    {isBulkMutating ? 'Processing...' : 'Restore selected'}
                  </Button>
                  <Button
                    type="button"
                    variant="danger"
                    className="min-h-11 rounded-xl"
                    disabled={isBulkMutating}
                    leftIcon={<Trash2 className="h-4 w-4" />}
                    onClick={handlePermanentDeleteSelectedImages}
                  >
                    {isBulkMutating ? 'Deleting...' : 'Delete permanently'}
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="danger"
                  className="min-h-11 rounded-xl"
                  disabled={isBulkMutating}
                  leftIcon={<Trash2 className="h-4 w-4" />}
                  onClick={handleSoftDeleteSelectedImages}
                >
                  {isBulkMutating ? 'Moving...' : 'Move to deleted'}
                </Button>
              )}
            </div>
          </section>
        )}

        {listQuery.error ? (
          <ErrorState onRetry={() => void listQuery.refetch()} />
        ) : isInitialLoading ? (
          <ResultGridSkeleton limit={IMAGE_LIBRARY_PAGE_LIMIT} />
        ) : !hasResults ? (
          <EmptyState
            isBatchView={isBatchView}
            isDeletedView={isDeletedView}
          />
        ) : (
          <>
            <ResultGrid
              results={results}
              isBookmarked={isDeletedView ? undefined : isBookmarked}
              showSimilarity={false}
              onBookmark={isDeletedView ? undefined : handleBookmark}
              onSelectResult={setSelectedResult}
              selectable={canManageImages}
              isSelected={(imageId) => selectedImageIds.has(imageId)}
              onToggleSelect={handleToggleSelect}
            />

            {listQuery.isFetchingNextPage && (
              <div className="mt-5">
                <ResultGridSkeleton limit={8} />
              </div>
            )}

            {listQuery.isFetchNextPageError && (
              <div className="flex flex-col items-center gap-3 rounded-2xl border border-red-100 bg-red-50 p-5 text-center">
                <p className="text-sm font-semibold text-red-700">Unable to load more images.</p>
                <Button
                  type="button"
                  variant="outline"
                  leftIcon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => void fetchNextImagePage()}
                >
                  Try again
                </Button>
              </div>
            )}
          </>
        )}

        {hasResults && (
          <div
            ref={loadMoreRef}
            className="flex min-h-16 items-center justify-center rounded-2xl border border-border bg-white px-4 py-5 text-center text-sm font-semibold text-ink-muted shadow-sm shadow-slate-200/50"
          >
            {listQuery.hasNextPage
              ? listQuery.isFetchingNextPage
                ? 'Loading more images...'
                : 'Scroll to load more images'
              : `All ${loadedCount.toLocaleString('vi-VN')} images are loaded`}
          </div>
        )}
      </PageContainer>

      {selectedResult && (
        <>
          <SearchResultDetailModal
            result={selectedResult}
            footerAction={renderSelectedImageManagementAction()}
            isBookmarked={!isDeletedView && isBookmarked(selectedResult.id)}
            showSimilarity={false}
            onBookmark={isDeletedView ? undefined : handleBookmark}
            onClose={() => setSelectedResult(null)}
            onFindSimilar={isDeletedView ? undefined : handleFindSimilar}
          />
        </>
      )}
    </>
  )
}

function LibraryMetric({
  label,
  value,
  helper,
}: {
  label: string
  value: string
  helper?: ReactNode
}) {
  return (
    <div className="border-r border-border px-4 py-3 last:border-r-0 sm:px-5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <p className="mt-1 text-xl font-black tracking-tight text-ink-primary sm:text-2xl">
        {value}
      </p>
      {helper && <p className="mt-1 text-xs text-ink-secondary">{helper}</p>}
    </div>
  )
}

function mapIndexingItemToSearchResult(item: AdminIndexingItem): SearchResult {
  return {
    id: item.image_id,
    thumbnailUrl: item.image_url,
    imageUrl: item.image_url,
    similarityScore: 0,
    metadata: {
      width: null,
      height: null,
      source: `Batch item: ${item.status}`,
    },
  }
}

function EmptyState({
  isBatchView,
  isDeletedView,
}: {
  isBatchView: boolean
  isDeletedView: boolean
}) {
  return (
    <section className="flex min-h-[360px] flex-col items-center justify-center border-y border-border px-5 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-1 text-ink-secondary">
        <Images className="h-6 w-6" />
      </div>
      <h2 className="font-display mt-5 text-xl font-bold text-ink-primary">
        {isBatchView ? 'No images in this batch state' : isDeletedView ? 'No deleted images' : 'No indexed images yet'}
      </h2>
      <p className="mt-2 max-w-md text-sm text-ink-secondary">
        {isBatchView
            ? 'Try another batch status filter or choose a different indexing batch.'
          : isDeletedView
            ? 'Soft-deleted images will appear here so they can be restored or permanently deleted.'
            : 'Indexed images will appear here after you upload images and indexing is completed.'}
      </p>
    </section>
  )
}

function ErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <section className="flex items-start justify-between gap-4 rounded-lg border border-red-200 bg-red-50 p-5 text-red-800">
      <div className="flex gap-3">
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <h2 className="font-semibold">Unable to load image library</h2>
          <p className="mt-1 text-sm text-red-700">Check the connection and try again.</p>
        </div>
      </div>
      <Button
        aria-label="Retry loading image library"
        className="shrink-0"
        size="icon"
        type="button"
        variant="ghost"
        onClick={onRetry}
      >
        <RefreshCw className="h-4 w-4" />
      </Button>
    </section>
  )
}
