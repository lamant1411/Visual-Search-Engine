import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertCircle, CheckSquare, FolderPlus, Images, Loader2, RefreshCw, RotateCcw, Trash2, Undo2, Upload, X } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/base/button'
import { PageContainer } from '@/components/layout/PageContainer'
import { AddToAlbumModal } from '@/features/albums/components/AddToAlbumModal'
import { useAuth } from '@/contexts/AuthContext'
import { ResultGrid, ResultGridSkeleton } from '@/features/search/components/ResultGrid'
import { SearchResultDetailModal } from '@/features/search/components/SearchResultDetailModal'
import { useBookmarks } from '@/features/search/hooks/useBookmarks'
import type { SearchResult } from '@/features/search/types'
import {
  createImageSearchHistoryKey,
  saveImageSearchFile,
} from '@/features/search/utils/imageSearchSession'
import { LibrarySidebar, type LibraryTab } from '@/components/layout/LibrarySidebar'
import { AlbumsContent } from './AlbumsPage'
import { albumsApi } from '@/lib/api/albums'
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

export default function ImageLibraryPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const loadMoreRef = useRef<HTMLDivElement | null>(null)

  const invalidateLibraryQueries = async (imageIdsToRemove?: number[]) => {
    if (imageIdsToRemove && imageIdsToRemove.length > 0) {
      const targetIds = new Set(imageIdsToRemove)

      queryClient.setQueriesData<{ pages: Array<{ items: SearchResult[]; total: number }>; pageParams: number[] }>(
        { queryKey: ['image-library'] },
        (oldData) => {
          if (!oldData || !oldData.pages) return oldData
          return {
            ...oldData,
            pages: oldData.pages.map((page) => {
              const newItems = page.items.filter((item) => !targetIds.has(item.id))
              const removedCount = page.items.length - newItems.length
              return {
                ...page,
                items: newItems,
                total: Math.max(0, page.total - removedCount),
              }
            }),
          }
        }
      )

      queryClient.setQueriesData<{ items: SearchResult[]; total: number }>(
        { queryKey: ['album-images'] },
        (oldData) => {
          if (!oldData || !oldData.items) return oldData
          const newItems = oldData.items.filter((item) => !targetIds.has(item.id))
          return {
            ...oldData,
            items: newItems,
            total: Math.max(0, oldData.total - (oldData.items.length - newItems.length)),
          }
        }
      )
    }

    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['image-library'] }),
      queryClient.invalidateQueries({ queryKey: ['home-count'] }),
      queryClient.invalidateQueries({ queryKey: ['trash-count'] }),
      queryClient.invalidateQueries({ queryKey: ['albums-count'] }),
      queryClient.invalidateQueries({ queryKey: ['albums'] }),
      queryClient.invalidateQueries({ queryKey: ['album-images'] }),
      queryClient.invalidateQueries({ queryKey: ['image-library-batches'] }),
    ])
  }
  const uploadInputRef = useRef<HTMLInputElement | null>(null)
  const [activeTab, setActiveTab] = useState<LibraryTab>('home')
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null)
  const [viewMode, setViewMode] = useState<LibraryViewMode>('indexed')
  const [selectedBatchId, setSelectedBatchId] = useState('')
  const [batchStatusFilter, setBatchStatusFilter] = useState<BatchItemStatusFilter>('all')
  const { user } = useAuth()
  const { isBookmarked, toggleBookmark, isToggling } = useBookmarks()
  const [mutatingImageId, setMutatingImageId] = useState<number | null>(null)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(() => new Set())
  const [isBulkMutating, setIsBulkMutating] = useState(false)
  const [isAddSelectedToAlbumOpen, setIsAddSelectedToAlbumOpen] = useState(false)
  const [selectedUploadFiles, setSelectedUploadFiles] = useState<File[]>([])
  const [isUploadingImages, setIsUploadingImages] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadStatusMessage, setUploadStatusMessage] = useState<string | null>(null)
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(null)
  const canManageImages = Boolean(user)
  const isDeletedView = viewMode === 'deleted'
  const isBatchView = canManageImages && !isDeletedView && Boolean(selectedBatchId)

  const albumsCountQuery = useQuery({
    queryKey: ['albums-count'],
    queryFn: () => albumsApi.list({ page: 1, limit: 1 }),
  })

  const homeCountQuery = useQuery({
    queryKey: ['home-count'],
    queryFn: () => imageLibraryApi.list({ page: 1, limit: 1 }),
  })

  const trashCountQuery = useQuery({
    queryKey: ['trash-count'],
    queryFn: () => imageLibraryApi.listDeleted({ page: 1, limit: 1 }),
  })

  function handleSelectTab(tab: LibraryTab) {
    setActiveTab(tab)
    setSelectedResult(null)
    handleClearSelectedImages()
    if (tab === 'home') {
      setViewMode('indexed')
      setSelectedBatchId('')
      setBatchStatusFilter('all')
    } else if (tab === 'trash') {
      setViewMode('deleted')
      setSelectedBatchId('')
      setBatchStatusFilter('all')
    } else if (tab === 'albums') {
      setSelectedBatchId('')
      setBatchStatusFilter('all')
    }
  }

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
  const groupedResults = useMemo(() => groupResultsByUploadDate(results), [results])
  const total = listQuery.data?.pages[0]?.total ?? 0
  const selectedCount = selectedImageIds.size


  type FailedUploadItem = {
    fileName: string
    reason: string
    file: File
  }

  const [failedUploads, setFailedUploads] = useState<FailedUploadItem[]>([])

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
    await handleUploadFilesList([...selectedUploadFiles])
  }

  async function handleUploadFilesList(filesToUpload: File[]) {
    if (filesToUpload.length === 0 || isUploadingImages) return

    setIsUploadingImages(true)
    setUploadProgress(0)
    setUploadErrorMessage(null)
    setUploadStatusMessage('Starting image upload batch...')
    setFailedUploads([])

    const currentFailed: FailedUploadItem[] = []
    const validFiles: File[] = []

    for (const file of filesToUpload) {
      if (file.size > MAX_IMAGE_UPLOAD_FILE_BYTES) {
        currentFailed.push({
          fileName: file.name,
          reason: `Larger than 10MB (${(file.size / (1024 * 1024)).toFixed(1)}MB)`,
          file,
        })
      } else if (!isSupportedImageFile(file)) {
        currentFailed.push({
          fileName: file.name,
          reason: 'Unsupported file type',
          file,
        })
      } else {
        validFiles.push(file)
      }
    }

    if (validFiles.length === 0) {
      setIsUploadingImages(false)
      setFailedUploads(currentFailed)
      setUploadStatusMessage(null)
      return
    }

    let batchId: string | null = null
    let uploadedCount = 0

    try {
      const batch = await adminApi.createIndexingBatch()
      batchId = batch.batch_id
      const chunks = splitFilesIntoUploadChunks(validFiles)

      for (const chunk of chunks) {
        try {
          await adminApi.uploadImagesToBatch(batch.batch_id, chunk, (chunkPercent) => {
            const currentChunkFiles = (chunkPercent / 100) * chunk.length
            const totalUploadedFiles = Math.min(validFiles.length, uploadedCount + currentChunkFiles)
            setUploadProgress(Math.round((totalUploadedFiles / validFiles.length) * 100))
          })
          uploadedCount += chunk.length
          setUploadProgress(Math.round((uploadedCount / validFiles.length) * 100))
          setUploadStatusMessage(`Uploaded ${uploadedCount}/${validFiles.length} images. Indexing is running in the background...`)
        } catch (chunkError) {
          console.warn('[ImageLibraryPage] Chunk upload failed, trying per-file upload', chunkError)
          for (const file of chunk) {
            try {
              await adminApi.uploadImagesToBatch(batch.batch_id, [file])
              uploadedCount += 1
              setUploadProgress(Math.round((uploadedCount / validFiles.length) * 100))
            } catch (fileError) {
              const reason = fileError instanceof Error ? fileError.message : 'Upload failed'
              currentFailed.push({ fileName: file.name, reason, file })
            }
          }
        }
      }

      await adminApi.completeIndexingBatch(batch.batch_id)
      setUploadProgress(100)
      if (uploadedCount > 0) {
        setUploadStatusMessage(`Uploaded ${uploadedCount} images. Images are now visible in your library!`)
        setSelectedUploadFiles([])
      } else {
        setUploadStatusMessage(null)
      }

      await invalidateLibraryQueries()
    } catch (error) {
      if (batchId) {
        try {
          await adminApi.completeIndexingBatch(batchId)
        } catch (completeError) {
          console.error('[ImageLibraryPage] Complete upload failed', completeError)
        }
      }
      const message = error instanceof Error ? error.message : 'Could not complete image upload batch.'
      setUploadErrorMessage(message)
    } finally {
      setIsUploadingImages(false)
      if (currentFailed.length > 0) {
        setFailedUploads(currentFailed)
      }
    }
  }

  function handleRetryFailedUploads() {
    const filesToRetry = failedUploads.map((item) => item.file)
    setFailedUploads([])
    void handleUploadFilesList(filesToRetry)
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
      const deletedIds = result.deleted_items.map((item) => item.image_id)
      removeSelectedIds(deletedIds)
      await invalidateLibraryQueries(deletedIds)
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
      const restoredIds = result.restored_items.map((item) => item.image_id)
      removeSelectedIds(restoredIds)
      await invalidateLibraryQueries(restoredIds)
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
      const deletedIds = result.deleted_items.map((item) => item.image_id)
      removeSelectedIds(deletedIds)
      await invalidateLibraryQueries(deletedIds)
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

    const targetId = selectedResult.id
    setMutatingImageId(targetId)
    try {
      await imageLibraryApi.delete(targetId)
      setSelectedResult(null)
      await invalidateLibraryQueries([targetId])
    } catch (error) {
      console.error('[ImageLibraryPage] Soft delete image failed', error)
      alert('Unable to move this image to deleted images. Check the API response or backend logs.')
    } finally {
      setMutatingImageId(null)
    }
  }

  async function handleRestoreSelectedImage() {
    if (!selectedResult || mutatingImageId) return

    const targetId = selectedResult.id
    setMutatingImageId(targetId)
    try {
      await imageLibraryApi.restore(targetId)
      setSelectedResult(null)
      await invalidateLibraryQueries([targetId])
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

    const targetId = selectedResult.id
    setMutatingImageId(targetId)
    try {
      await imageLibraryApi.permanentDelete(targetId)
      setSelectedResult(null)
      await invalidateLibraryQueries([targetId])
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
  const selectedBatch = batches.find((batch) => batch.batch_id === selectedBatchId)
  const hasPendingIndexing =
    isUploadingImages ||
    rawResults.some((result) => result.metadata?.status?.toLowerCase() === 'pending') ||
    batches.some((batch) => batch.status === 'queued' || batch.status === 'running')

  const failedResults = useMemo(
    () => rawResults.filter((result) => result.metadata?.status?.toLowerCase() === 'failed'),
    [rawResults]
  )

  const modeTitle = isBatchView
    ? 'Batch images'
    : activeTab === 'trash'
      ? 'Trash'
      : activeTab === 'albums'
        ? 'Albums'
        : 'Home'
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

  const totalHome = !isDeletedView ? total : (homeCountQuery.data?.total ?? 0)
  const totalAlbums = albumsCountQuery.data?.total ?? 0
  const totalTrash = isDeletedView ? total : (trashCountQuery.data?.total ?? 0)

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
                      : activeTab === 'trash'
                        ? 'border-red-100 bg-red-50 text-red-700'
                        : activeTab === 'albums'
                          ? 'border-violet-100 bg-violet-50 text-violet-700'
                          : 'border-blue-100 bg-blue-50 text-blue-700',
                  ].join(' ')}>
                    {isBatchView ? 'Batch view' : activeTab === 'trash' ? 'Deleted images' : activeTab === 'albums' ? 'Personal collections' : 'Search ready'}
                  </span>

                  {hasPendingIndexing && (
                    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700 shadow-sm">
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-amber-600" />
                      Search optimization is running
                    </span>
                  )}
                </div>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-ink-secondary">
                  {activeTab === 'albums'
                    ? 'Manage personal image collections, organize photos into albums, or restore removed items.'
                    : modeDescription}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-3 overflow-hidden rounded-2xl border border-border bg-surface-1/40 lg:min-w-[420px]">
              <LibraryMetric label="Total images" value={totalHome.toLocaleString('en-US')} />
              <LibraryMetric label="Albums" value={totalAlbums.toLocaleString('en-US')} />
              <LibraryMetric label="Trash" value={totalTrash.toLocaleString('en-US')} />
            </div>
          </div>
        </header>

        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          <LibrarySidebar
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            counts={{
              home: totalHome,
              albums: totalAlbums,
              trash: totalTrash,
            }}
          />

          <main className="min-w-0 flex-1 space-y-6">
            {activeTab === 'albums' ? (
              <AlbumsContent embedded />
            ) : (
              <>

                {!isDeletedView && failedResults.length > 0 && (
                  <section className="rounded-2xl border border-red-200 bg-red-50 p-4 shadow-sm shadow-red-100/50 sm:p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-600 text-white shadow-sm">
                          <AlertCircle className="h-5 w-5" />
                        </div>
                        <div>
                          <h2 className="text-sm font-bold text-red-900 sm:text-base">
                            Found {failedResults.length} image(s) with AI indexing errors
                          </h2>
                          <p className="mt-1 text-xs leading-5 text-red-700 sm:text-sm">
                            These images are saved safely in the library, but vector/OCR indexing failed. They are marked with <span className="font-bold underline">Index Error</span> in red.
                          </p>
                        </div>
                      </div>
                    </div>
                  </section>
                )}


                <section className="rounded-2xl border border-border bg-white p-4 shadow-sm shadow-slate-200/60 sm:p-5">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink-primary">Upload to your library</p>
                      <p className="mt-1 text-xs leading-5 text-ink-secondary">
                        Add JPG, PNG, or WebP images to your private library. Each image must be 10MB or less; large selections are uploaded in 100MB chunks.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2.5 shrink-0">
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
                        className="min-h-11 rounded-xl shrink-0 whitespace-nowrap"
                        leftIcon={<Upload className="h-4 w-4" />}
                        disabled={isUploadingImages}
                        onClick={() => uploadInputRef.current?.click()}
                      >
                        Choose images
                      </Button>
                      <Button
                        type="button"
                        className="min-h-11 rounded-xl shrink-0 whitespace-nowrap"
                        leftIcon={isUploadingImages ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        disabled={selectedUploadFiles.length === 0 || isUploadingImages}
                        onClick={handleUploadSelectedFiles}
                      >
                        {isUploadingImages ? 'Uploading...' : 'Upload and index'}
                      </Button>
                    </div>
                  </div>

                  {(selectedUploadFiles.length > 0 || uploadStatusMessage || uploadErrorMessage || failedUploads.length > 0) && (
                    <div className="mt-4 space-y-3 rounded-2xl border border-border bg-surface-1/40 p-4">
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-bold text-ink-primary">
                          {selectedUploadFiles.length.toLocaleString('en-US')} selected image(s)
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

                      {failedUploads.length > 0 && (
                        <div className="space-y-2.5 rounded-xl border border-red-200 bg-red-50/80 p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="flex items-center gap-2 text-xs font-bold text-red-800">
                              <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                              {failedUploads.length} image(s) failed to upload
                            </p>
                            <div className="flex items-center gap-3">
                              <button
                                type="button"
                                className="text-xs font-bold text-red-700 underline underline-offset-2 hover:text-red-900"
                                onClick={handleRetryFailedUploads}
                              >
                                Retry failed images
                              </button>
                              <button
                                type="button"
                                className="rounded-full p-1 text-red-500 hover:bg-red-100 hover:text-red-800"
                                aria-label="Dismiss error notice"
                                onClick={() => setFailedUploads([])}
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                          <div className="max-h-36 space-y-1.5 overflow-y-auto pr-1">
                            {failedUploads.map((item, idx) => (
                              <div
                                key={`${item.fileName}-${idx}`}
                                className="flex items-center justify-between gap-2 rounded-lg border border-red-100 bg-white px-3 py-2 text-xs font-medium text-red-700 shadow-sm"
                              >
                                <span className="truncate font-semibold max-w-[200px] sm:max-w-xs">{item.fileName}</span>
                                <span className="shrink-0 text-[11px] font-semibold text-red-500">{item.reason}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                <section className="sticky top-16 z-30 -mx-4 border-y border-border bg-surface-0/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:rounded-2xl sm:border sm:bg-white sm:p-3 sm:shadow-sm sm:shadow-slate-200/60">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-bold text-ink-primary">
                      {isDeletedView ? 'Trash images' : 'Library images'}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
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
                        <>
                          <Button
                            type="button"
                            variant="outline"
                            className="min-h-11 rounded-xl"
                            disabled={isBulkMutating}
                            leftIcon={<FolderPlus className="h-4 w-4" />}
                            onClick={() => setIsAddSelectedToAlbumOpen(true)}
                          >
                            Add selected to album
                          </Button>
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
                        </>
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
                    <div className="space-y-8">
                      {groupedResults.map((group) => (
                        <section key={group.key} className="space-y-3">
                          <div className="flex items-center justify-between gap-3 border-b border-border pb-2">
                            <div>
                              {/* <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">Upload date</p> */}
                              <h2 className="italic text-sm text-ink-muted">{group.label}</h2>
                            </div>
                            <span className="rounded-full border border-border bg-white px-3 py-1 text-xs font-bold text-ink-secondary shadow-sm">
                              {group.items.length.toLocaleString('en-US')} image(s)
                            </span>
                          </div>
                          <ResultGrid
                            results={group.items}
                            isBookmarked={isDeletedView ? undefined : isBookmarked}
                            showSimilarity={false}
                            onBookmark={isDeletedView ? undefined : handleBookmark}
                            onSelectResult={setSelectedResult}
                            selectable={canManageImages}
                            isSelected={(imageId) => selectedImageIds.has(imageId)}
                            onToggleSelect={handleToggleSelect}
                          />
                        </section>
                      ))}
                    </div>

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

                    {hasResults && (
                      <div
                        ref={loadMoreRef}
                        className="flex min-h-16 items-center justify-center rounded-2xl border border-border bg-white px-4 py-5 text-center text-sm font-semibold text-ink-muted shadow-sm shadow-slate-200/50"
                      >
                        {listQuery.hasNextPage
                          ? listQuery.isFetchingNextPage
                            ? 'Loading more images...'
                            : 'Scroll to load more images'
                          : `All ${loadedCount.toLocaleString('en-US')} images are loaded`}
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </main>
        </div>
      </PageContainer>

      {isAddSelectedToAlbumOpen && (
        <AddToAlbumModal
          imageIds={Array.from(selectedImageIds)}
          onClose={() => setIsAddSelectedToAlbumOpen(false)}
          onSuccess={handleClearSelectedImages}
        />
      )}

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
    <div className="min-w-0 border-r border-border px-3 py-3 last:border-r-0 sm:px-5">
      <p className="truncate text-[11px] font-bold uppercase tracking-wide text-ink-muted">
        {label}
      </p>
      <p className="mt-1 truncate text-xl font-black tracking-tight text-ink-primary sm:text-2xl">
        {value}
      </p>
      {helper && <p className="mt-1 truncate text-xs text-ink-secondary">{helper}</p>}
    </div>
  )
}

function mapIndexingItemToSearchResult(item: AdminIndexingItem): SearchResult {
  return {
    id: item.image_id,
    thumbnailUrl: item.image_url,
    imageUrl: item.image_url,
    similarityScore: 0,
    createdAt: item.created_at,
    metadata: {
      width: null,
      height: null,
      source: `Batch item: ${item.status}`,
      status: item.status,
    },
  }
}


type UploadDateGroup = {
  key: string
  label: string
  items: SearchResult[]
}

function groupResultsByUploadDate(results: SearchResult[]): UploadDateGroup[] {
  const groups = new Map<string, UploadDateGroup>()

  for (const result of results) {
    const parsedDate = result.createdAt ? new Date(result.createdAt) : null
    const hasValidDate = parsedDate !== null && !Number.isNaN(parsedDate.getTime())
    const key = hasValidDate ? parsedDate.toISOString().slice(0, 10) : 'unknown'
    const label = hasValidDate
      ? parsedDate.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
      : 'Unknown upload date'

    const currentGroup = groups.get(key)
    if (currentGroup) {
      currentGroup.items.push(result)
    } else {
      groups.set(key, { key, label, items: [result] })
    }
  }

  return Array.from(groups.values())
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
