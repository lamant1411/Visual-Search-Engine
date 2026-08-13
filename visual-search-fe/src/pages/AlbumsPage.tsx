import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowLeft, FolderOpen, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/base/button'
import { PageContainer } from '@/components/layout/PageContainer'
import { SearchResultDetailModal } from '@/features/search/components/SearchResultDetailModal'
import { ResultGrid } from '@/features/search/components/ResultGrid'
import { useBookmarks } from '@/features/search/hooks/useBookmarks'
import type { SearchResult } from '@/features/search/types'
import {
  createImageSearchHistoryKey,
  saveImageSearchFile,
} from '@/features/search/utils/imageSearchSession'
import { albumsApi, type Album, type AlbumCreatePayload, type AlbumImage } from '@/lib/api/albums'
import { imageLibraryApi } from '@/lib/api/images'

const ALBUM_PAGE_LIMIT = 50
const ALBUM_IMAGE_PAGE_LIMIT = 40

type AlbumViewMode = 'active' | 'deleted'

type AlbumFormState = {
  name: string
  description: string
}

const emptyForm: AlbumFormState = {
  name: '',
  description: '',
}

export function AlbumsContent({ embedded = false }: { embedded?: boolean }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isBookmarked, toggleBookmark, isToggling } = useBookmarks()
  const [viewMode, setViewMode] = useState<AlbumViewMode>('active')
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null)
  const [selectedImage, setSelectedImage] = useState<AlbumImage | null>(null)
  const [showFormModal, setShowFormModal] = useState(false)
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
  const [form, setForm] = useState<AlbumFormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [mutatingImageId, setMutatingImageId] = useState<number | null>(null)
  const [selectedImageIds, setSelectedImageIds] = useState<Set<number>>(() => new Set())

  const albumsQuery = useQuery({
    queryKey: ['albums'],
    queryFn: () => albumsApi.list({ page: 1, limit: ALBUM_PAGE_LIMIT }),
  })

  const deletedAlbumsQuery = useQuery({
    queryKey: ['albums', 'deleted'],
    queryFn: () => albumsApi.listDeleted({ page: 1, limit: ALBUM_PAGE_LIMIT }),
  })

  const displayedAlbums = useMemo(
    () => (viewMode === 'active' ? albumsQuery.data?.items ?? [] : deletedAlbumsQuery.data?.items ?? []),
    [albumsQuery.data?.items, deletedAlbumsQuery.data?.items, viewMode],
  )
  const displayedTotal = viewMode === 'active'
    ? albumsQuery.data?.total ?? displayedAlbums.length
    : deletedAlbumsQuery.data?.total ?? displayedAlbums.length
  const selectedAlbum = useMemo(
    () => (selectedAlbumId !== null ? displayedAlbums.find((album) => album.id === selectedAlbumId) ?? null : null),
    [displayedAlbums, selectedAlbumId],
  )
  const activeAlbumId = selectedAlbum?.id ?? null

  const imagesQuery = useQuery({
    queryKey: ['album-images', activeAlbumId],
    queryFn: () => albumsApi.listImages(activeAlbumId as number, { page: 1, limit: ALBUM_IMAGE_PAGE_LIMIT }),
    enabled: activeAlbumId !== null,
  })

  const invalidateAlbums = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['albums'] }),
      queryClient.invalidateQueries({ queryKey: ['albums-count'] }),
      queryClient.invalidateQueries({ queryKey: ['home-count'] }),
      queryClient.invalidateQueries({ queryKey: ['trash-count'] }),
      queryClient.invalidateQueries({ queryKey: ['image-library'] }),
      queryClient.invalidateQueries({ queryKey: ['album-images'] }),
    ])
  }

  const createMutation = useMutation({
    mutationFn: (payload: AlbumCreatePayload) => albumsApi.create(payload),
    onSuccess: async (album) => {
      setForm(emptyForm)
      setFormError(null)
      setShowFormModal(false)
      await invalidateAlbums()
      setViewMode('active')
      setSelectedAlbumId(album.id)
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ albumId, payload }: { albumId: number; payload: AlbumCreatePayload }) =>
      albumsApi.update(albumId, payload),
    onSuccess: async (album) => {
      setEditingAlbum(null)
      setForm(emptyForm)
      setFormError(null)
      setShowFormModal(false)
      await invalidateAlbums()
      setSelectedAlbumId(album.id)
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (albumId: number) => albumsApi.delete(albumId),
    onSuccess: async () => {
      setSelectedAlbumId(null)
      setSelectedImage(null)
      setSelectedImageIds(new Set())
      setEditingAlbum(null)
      setShowFormModal(false)
      await invalidateAlbums()
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (albumId: number) => albumsApi.restore(albumId),
    onSuccess: async (album) => {
      await invalidateAlbums()
      setViewMode('active')
      setSelectedAlbumId(album.id)
    },
  })

  const permanentDeleteMutation = useMutation({
    mutationFn: (albumId: number) => albumsApi.permanentDelete(albumId),
    onSuccess: async () => {
      setSelectedAlbumId(null)
      await invalidateAlbums()
    },
  })

  const removeImageMutation = useMutation({
    mutationFn: ({ albumId, imageId }: { albumId: number; imageId: number }) =>
      albumsApi.removeImage(albumId, imageId),
    onSuccess: async (_response, variables) => {
      setSelectedImage(null)
      setSelectedImageIds((current) => {
        const next = new Set(current)
        next.delete(variables.imageId)
        return next
      })
      queryClient.setQueriesData<{ items: SearchResult[]; total: number }>(
        { queryKey: ['album-images', variables.albumId] },
        (oldData) => {
          if (!oldData || !oldData.items) return oldData
          const newItems = oldData.items.filter((item) => item.id !== variables.imageId)
          return {
            ...oldData,
            items: newItems,
            total: Math.max(0, oldData.total - 1),
          }
        }
      )
      await invalidateAlbums()
    },
  })

  const bulkRemoveImagesMutation = useMutation({
    mutationFn: ({ albumId, imageIds }: { albumId: number; imageIds: number[] }) =>
      albumsApi.removeImages(albumId, imageIds),
    onSuccess: async (_response, variables) => {
      const removedSet = new Set(variables.imageIds)
      setSelectedImageIds(new Set())
      queryClient.setQueriesData<{ items: SearchResult[]; total: number }>(
        { queryKey: ['album-images', variables.albumId] },
        (oldData) => {
          if (!oldData || !oldData.items) return oldData
          const newItems = oldData.items.filter((item) => !removedSet.has(item.id))
          return {
            ...oldData,
            items: newItems,
            total: Math.max(0, oldData.total - (oldData.items.length - newItems.length)),
          }
        }
      )
      await invalidateAlbums()
    },
  })

  const isSavingAlbum = createMutation.isPending || updateMutation.isPending
  const images = imagesQuery.data?.items ?? []
  const selectedImageCount = images.filter((image) => selectedImageIds.has(image.id)).length
  const isAllImagesSelected = images.length > 0 && selectedImageCount === images.length
  const selectedResult = selectedImage ? albumImageToSearchResult(selectedImage) : null
  const isDeletedView = viewMode === 'deleted'

  function changeViewMode(nextMode: AlbumViewMode) {
    setViewMode(nextMode)
    setSelectedAlbumId(null)
    setSelectedImage(null)
    setSelectedImageIds(new Set())
    setEditingAlbum(null)
    setForm(emptyForm)
    setFormError(null)
    setShowFormModal(false)
  }

  function startEdit(album: Album) {
    setEditingAlbum(album)
    setForm({
      name: album.name,
      description: album.description ?? '',
    })
    setFormError(null)
    setShowFormModal(true)
  }

  function cancelEdit() {
    setEditingAlbum(null)
    setForm(emptyForm)
    setFormError(null)
    setShowFormModal(false)
  }

  function handleSubmitAlbum(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const payload = toAlbumPayload(form)
    if (!payload.name) {
      setFormError('Album name is required.')
      return
    }

    if (editingAlbum) {
      updateMutation.mutate({ albumId: editingAlbum.id, payload })
    } else {
      createMutation.mutate(payload)
    }
  }

  function handleBookmark(result: SearchResult) {
    if (isToggling) return
    toggleBookmark(result.id)
  }

  async function handleFindSimilar(result: SearchResult, file?: File) {
    setSelectedImage(null)

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

  async function handleSoftDeleteSelectedImage() {
    if (!selectedImage || mutatingImageId) return
    if (!window.confirm('Move this image to deleted images? It will be hidden from this album until restored.')) return

    const deletedId = selectedImage.id
    setMutatingImageId(deletedId)
    try {
      await imageLibraryApi.delete(deletedId)
      setSelectedImage(null)
      if (activeAlbumId !== null) {
        queryClient.setQueriesData<{ items: SearchResult[]; total: number }>(
          { queryKey: ['album-images', activeAlbumId] },
          (oldData) => {
            if (!oldData || !oldData.items) return oldData
            return {
              ...oldData,
              items: oldData.items.filter((item) => item.id !== deletedId),
              total: Math.max(0, oldData.total - 1),
            }
          }
        )
      }
      await invalidateAlbums()
    } catch (error) {
      console.error('[AlbumsPage] Soft delete image failed', error)
      alert('Unable to move this image to deleted images. Check the API response or backend logs.')
    } finally {
      setMutatingImageId(null)
    }
  }

  function handleRemoveSelectedImageFromAlbum() {
    if (!selectedImage || !activeAlbumId) return
    removeImageMutation.mutate({ albumId: activeAlbumId, imageId: selectedImage.id })
  }

  function toggleSelectedImage(imageId: number) {
    setSelectedImageIds((current) => {
      const next = new Set(current)
      if (next.has(imageId)) {
        next.delete(imageId)
      } else {
        next.add(imageId)
      }
      return next
    })
  }

  function toggleSelectAllImages() {
    if (isAllImagesSelected) {
      setSelectedImageIds(new Set())
      return
    }
    setSelectedImageIds(new Set(images.map((image) => image.id)))
  }

  function handleBulkRemoveImagesFromAlbum() {
    if (!activeAlbumId || selectedImageCount === 0) return
    const imageIds = images.filter((image) => selectedImageIds.has(image.id)).map((image) => image.id)
    if (!window.confirm(`Remove ${imageIds.length} selected image(s) from this album? Images will remain in your library.`)) return
    bulkRemoveImagesMutation.mutate({ albumId: activeAlbumId, imageIds })
  }

  function renderAlbumImageActions() {
    if (!selectedImage) return undefined

    return (
      <div className="space-y-3">
        <Button
          fullWidth
          type="button"
          variant="outline"
          disabled={removeImageMutation.isPending || mutatingImageId === selectedImage.id}
          leftIcon={<X className="h-4 w-4" />}
          onClick={handleRemoveSelectedImageFromAlbum}
        >
          {removeImageMutation.isPending ? 'Removing...' : 'Remove from album'}
        </Button>
        <Button
          fullWidth
          type="button"
          variant="danger"
          disabled={removeImageMutation.isPending || mutatingImageId === selectedImage.id}
          leftIcon={<Trash2 className="h-4 w-4" />}
          onClick={handleSoftDeleteSelectedImage}
        >
          {mutatingImageId === selectedImage.id ? 'Moving...' : 'Move to deleted'}
        </Button>
      </div>
    )
  }

  const content = (
    <div className="space-y-6">
      {!embedded && (
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-wider text-accent-600">Image organization</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold text-ink-primary sm:text-4xl">Albums</h1>
              <span className="inline-flex min-h-8 items-center rounded-full border border-border bg-white px-3.5 text-sm font-semibold text-ink-secondary shadow-sm">
                {displayedTotal}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-ink-secondary sm:text-base">
              Organize your photo collection into albums. Click any album to open its full detail view.
            </p>
          </div>
          <Button type="button" variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => invalidateAlbums()}>
            Refresh
          </Button>
        </header>
      )}

      {/* View mode tabs & Create button */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant={viewMode === 'active' ? 'primary' : 'outline'}
            onClick={() => changeViewMode('active')}
          >
            Active albums
          </Button>
          <Button
            type="button"
            variant={viewMode === 'deleted' ? 'primary' : 'outline'}
            onClick={() => changeViewMode('deleted')}
          >
            Deleted albums
          </Button>
        </div>

        {!isDeletedView && (
          <Button
            type="button"
            variant="primary"
            leftIcon={<Plus className="h-4 w-4" />}
            onClick={() => {
              setEditingAlbum(null)
              setForm(emptyForm)
              setFormError(null)
              setShowFormModal(true)
            }}
          >
            Create album
          </Button>
        )}
      </div>

      {/* IF NO ALBUM IS SELECTED: SHOW THE ALBUM CARDS GRID */}
      {selectedAlbumId === null ? (
        <section className="min-h-[420px]">
          {(viewMode === 'active' ? albumsQuery.isLoading : deletedAlbumsQuery.isLoading) ? (
            <div className="flex min-h-64 items-center justify-center rounded-3xl border border-border bg-white p-8 text-sm font-semibold text-ink-secondary shadow-sm">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-accent-600" /> Loading albums...
            </div>
          ) : displayedAlbums.length === 0 ? (
            <div className="flex min-h-[380px] flex-col items-center justify-center rounded-3xl border border-dashed border-border bg-white p-8 text-center shadow-sm">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-surface-1 text-ink-muted">
                <FolderOpen className="h-8 w-8" />
              </div>
              <p className="mt-4 text-base font-bold text-ink-primary">
                {isDeletedView ? 'No deleted albums' : 'No albums yet'}
              </p>
              <p className="mt-1.5 max-w-md text-sm text-ink-secondary leading-relaxed">
                {isDeletedView
                  ? 'Deleted albums will appear here for restore or permanent deletion.'
                  : 'Create your first album to start organizing your images into custom collections.'}
              </p>
              {!isDeletedView && (
                <Button
                  type="button"
                  className="mt-5"
                  leftIcon={<Plus className="h-4 w-4" />}
                  onClick={() => {
                    setEditingAlbum(null)
                    setForm(emptyForm)
                    setFormError(null)
                    setShowFormModal(true)
                  }}
                >
                  Create your first album
                </Button>
              )}
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
              {displayedAlbums.map((album) => (
                <div
                  key={album.id}
                  className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-border bg-white p-5 shadow-sm shadow-slate-200/60 transition duration-200 hover:-translate-y-1 hover:border-accent-300 hover:shadow-xl hover:shadow-accent-500/10 cursor-pointer"
                  onClick={() => {
                    setSelectedAlbumId(album.id)
                    setSelectedImage(null)
                    setSelectedImageIds(new Set())
                  }}
                >
                  {/* Card Media Preview */}
                  <div className="relative aspect-[16/10] w-full overflow-hidden rounded-2xl bg-surface-1">
                    {album.cover_image_url ? (
                      <img
                        src={album.cover_image_url}
                        alt={album.name}
                        className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-accent-500/10 via-surface-1 to-surface-2 text-accent-600">
                        <FolderOpen className="h-12 w-12 stroke-[1.5] transition duration-300 group-hover:scale-110" />
                      </div>
                    )}
                    <span className="absolute top-3 right-3 rounded-full border border-black/5 bg-white/95 px-3 py-1 text-xs font-bold text-ink-primary shadow-sm backdrop-blur-md">
                      {album.image_count} {album.image_count === 1 ? 'image' : 'images'}
                    </span>
                  </div>

                  {/* Card Text Content */}
                  <div className="mt-4 flex-1">
                    <h3 className="line-clamp-1 text-lg font-bold text-ink-primary group-hover:text-accent-600 transition">
                      {album.name}
                    </h3>
                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-ink-secondary min-h-[40px]">
                      {album.description || 'No description provided.'}
                    </p>
                  </div>

                  {/* Card Bottom Actions Bar */}
                  <div
                    className="mt-4 flex items-center justify-between border-t border-border/60 pt-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span className="text-xs font-semibold text-accent-600 group-hover:underline">
                      View album detail →
                    </span>
                    <div className="flex items-center gap-1">
                      {viewMode === 'active' ? (
                        <>
                          <button
                            type="button"
                            title="Edit album"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary hover:bg-accent-50 hover:text-accent-600 transition"
                            onClick={() => startEdit(album)}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            title="Delete album"
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary hover:bg-red-50 hover:text-red-600 transition"
                            onClick={() => {
                              if (window.confirm(`Move album "${album.name}" to deleted albums? Images will not be deleted.`)) {
                                deleteMutation.mutate(album.id)
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          title="Restore album"
                          className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-secondary hover:bg-emerald-50 hover:text-emerald-600 transition"
                          onClick={() => restoreMutation.mutate(album.id)}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        /* IF AN ALBUM IS SELECTED: SHOW DETAILED ALBUM VIEW ONLY */
        <section className="min-h-[560px] rounded-3xl border border-border bg-white p-6 shadow-sm shadow-slate-200/70 space-y-6">
          {/* Top navigation back button */}
          <div className="flex items-center justify-between border-b border-border pb-4">
            <Button
              type="button"
              variant="outline"
              leftIcon={<ArrowLeft className="h-4 w-4" />}
              onClick={() => setSelectedAlbumId(null)}
            >
              Back to albums
            </Button>
            <span className="text-xs font-bold text-ink-muted uppercase tracking-wider">
              {isDeletedView ? 'Deleted Album View' : 'Album Detail'}
            </span>
          </div>

          {isDeletedView && selectedAlbum ? (
            <DeletedAlbumDetail
              album={selectedAlbum}
              images={images}
              isLoadingImages={imagesQuery.isLoading}
              isRestoring={restoreMutation.isPending}
              isDeleting={permanentDeleteMutation.isPending}
              onRestore={() => restoreMutation.mutate(selectedAlbum.id)}
              onPermanentDelete={() => {
                if (window.confirm(`Permanently delete album "${selectedAlbum.name}"? Images will not be deleted, but this album cannot be restored.`)) {
                  permanentDeleteMutation.mutate(selectedAlbum.id)
                }
              }}
            />
          ) : selectedAlbum ? (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-2xl font-black text-ink-primary">{selectedAlbum.name}</h2>
                    <span className="inline-flex items-center rounded-full border border-border bg-surface-1 px-3 py-0.5 text-xs font-bold text-ink-secondary">
                      {selectedAlbum.image_count} active images
                    </span>
                  </div>
                  {selectedAlbum.description && (
                    <p className="mt-2 max-w-3xl text-sm leading-6 text-ink-secondary">{selectedAlbum.description}</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <Button type="button" variant="outline" leftIcon={<Pencil className="h-4 w-4" />} onClick={() => startEdit(selectedAlbum)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    leftIcon={<Trash2 className="h-4 w-4" />}
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      if (window.confirm(`Move album "${selectedAlbum.name}" to deleted albums? Images will not be deleted.`)) {
                        deleteMutation.mutate(selectedAlbum.id)
                      }
                    }}
                  >
                    Move to deleted
                  </Button>
                </div>
              </div>

              {imagesQuery.isLoading ? (
                <div className="flex min-h-64 items-center justify-center text-sm font-semibold text-ink-secondary">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin text-accent-600" /> Loading images...
                </div>
              ) : images.length === 0 ? (
                <div className="rounded-2xl border border-border bg-surface-1/40 p-12 text-center">
                  <FolderOpen className="mx-auto h-10 w-10 text-ink-muted" />
                  <p className="mt-3 text-base font-bold text-ink-primary">No active images in this album</p>
                  <p className="mt-1 text-sm text-ink-secondary max-w-sm mx-auto">
                    Use Add to album from an image detail view in the Image Library.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-1/60 p-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-semibold text-ink-secondary">
                      {selectedImageCount} of {images.length} images selected
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={toggleSelectAllImages}>
                        {isAllImagesSelected ? 'Clear selection' : 'Select all'}
                      </Button>
                      {selectedImageCount > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={bulkRemoveImagesMutation.isPending}
                          leftIcon={bulkRemoveImagesMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                          onClick={handleBulkRemoveImagesFromAlbum}
                        >
                          {bulkRemoveImagesMutation.isPending ? 'Removing...' : 'Remove selected'}
                        </Button>
                      )}
                    </div>
                  </div>
                  <ResultGrid
                    results={images.map(albumImageToSearchResult)}
                    showSimilarity={false}
                    onSelectResult={(result) => {
                      const found = images.find((img) => img.id === result.id)
                      if (found) setSelectedImage(found)
                    }}
                    selectable={true}
                    isSelected={(imageId) => selectedImageIds.has(imageId)}
                    onToggleSelect={(result) => toggleSelectedImage(result.id)}
                  />
                </div>
              )}
            </div>
          ) : null}
        </section>
      )}

      {/* Create / Edit Form Modal */}
      {(showFormModal || editingAlbum !== null) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="w-full max-w-md rounded-3xl border border-border bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3">
              <h2 className="text-lg font-bold text-ink-primary">
                {editingAlbum ? 'Edit album' : 'Create new album'}
              </h2>
              <button
                type="button"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-1 hover:text-ink-primary"
                onClick={cancelEdit}
                aria-label="Close dialog"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitAlbum} className="mt-4 space-y-4">
              <label className="block text-sm font-bold text-ink-primary">
                Name
                <input
                  className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold outline-none transition focus:border-accent-600 focus:ring-4 focus:ring-accent-100"
                  value={form.name}
                  maxLength={255}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  placeholder="Travel screenshots"
                  autoFocus
                />
              </label>

              <label className="block text-sm font-bold text-ink-primary">
                Description
                <textarea
                  className="mt-2 min-h-24 w-full resize-y rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium outline-none transition focus:border-accent-600 focus:ring-4 focus:ring-accent-100"
                  value={form.description}
                  maxLength={2000}
                  onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                  placeholder="Optional notes for this album"
                />
              </label>

              {formError && <p className="text-sm font-semibold text-red-700">{formError}</p>}
              {(createMutation.error || updateMutation.error) && (
                <p className="text-sm font-semibold text-red-700">Unable to save album. Check the data and try again.</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={cancelEdit}
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  leftIcon={isSavingAlbum ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  disabled={isSavingAlbum}
                >
                  {editingAlbum ? 'Save changes' : 'Create album'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )

  if (embedded) {
    return (
      <>
        {content}
        {selectedResult && (
          <SearchResultDetailModal
            result={selectedResult}
            footerAction={renderAlbumImageActions()}
            isBookmarked={isBookmarked(selectedResult.id)}
            showSimilarity={false}
            showAddToAlbum={false}
            onBookmark={handleBookmark}
            onClose={() => setSelectedImage(null)}
            onFindSimilar={handleFindSimilar}
          />
        )}
      </>
    )
  }

  return (
    <>
      <PageContainer size="wide" className="space-y-7 py-8 sm:py-10">
        {content}
      </PageContainer>

      {selectedResult && (
        <SearchResultDetailModal
          result={selectedResult}
          footerAction={renderAlbumImageActions()}
          isBookmarked={isBookmarked(selectedResult.id)}
          showSimilarity={false}
          showAddToAlbum={false}
          onBookmark={handleBookmark}
          onClose={() => setSelectedImage(null)}
          onFindSimilar={handleFindSimilar}
        />
      )}
    </>
  )
}

export default function AlbumsPage() {
  return <AlbumsContent />
}

function DeletedAlbumDetail({
  album,
  images,
  isLoadingImages,
  isRestoring,
  isDeleting,
  onRestore,
  onPermanentDelete,
}: {
  album: Album
  images: AlbumImage[]
  isLoadingImages: boolean
  isRestoring: boolean
  isDeleting: boolean
  onRestore: () => void
  onPermanentDelete: () => void
}) {
  return (
    <div className="flex min-h-[480px] flex-col justify-between gap-6">
      <div>
        <p className="text-xs font-bold uppercase text-red-600">Deleted album</p>
        <h2 className="mt-1 text-2xl font-black text-ink-primary">{album.name}</h2>
        {album.description && <p className="mt-2 max-w-2xl text-sm text-ink-secondary">{album.description}</p>}
        <div className="mt-5 rounded-2xl border border-red-100 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-800">This album is currently deleted.</p>
          <p className="mt-1 text-sm text-red-700">You can restore it to the active album list or permanently delete only the album container. Images are not deleted.</p>
        </div>
        {album.deleted_at && (
          <p className="mt-3 text-xs font-semibold text-ink-muted">Deleted at: {new Date(album.deleted_at).toLocaleString()}</p>
        )}
        <div className="mt-6">
          <p className="text-sm font-bold text-ink-primary">Images in this deleted album</p>
          <p className="mt-1 text-sm text-ink-secondary">Images are shown read-only here. Restore the album before opening image details or editing album images.</p>
          {isLoadingImages ? (
            <div className="mt-4 flex min-h-32 items-center justify-center rounded-2xl border border-border bg-surface-1 text-sm font-semibold text-ink-secondary">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading images...
            </div>
          ) : images.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-border bg-surface-1 p-8 text-center">
              <FolderOpen className="mx-auto h-8 w-8 text-ink-muted" />
              <p className="mt-3 text-sm font-bold text-ink-primary">No active images in this deleted album</p>
              <p className="mt-1 text-sm text-ink-secondary">Deleted images are hidden until restored.</p>
            </div>
          ) : (
            <div className="mt-4">
              <ResultGrid
                results={images.map(albumImageToSearchResult)}
                showSimilarity={false}
                selectable={false}
              />
            </div>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
        <Button
          type="button"
          variant="outline"
          disabled={isRestoring || isDeleting}
          leftIcon={isRestoring ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
          onClick={onRestore}
        >
          {isRestoring ? 'Restoring...' : 'Restore album'}
        </Button>
        <Button
          type="button"
          variant="danger"
          disabled={isRestoring || isDeleting}
          leftIcon={isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          onClick={onPermanentDelete}
        >
          {isDeleting ? 'Deleting...' : 'Delete permanently'}
        </Button>
      </div>
    </div>
  )
}



function albumImageToSearchResult(image: AlbumImage): SearchResult {
  return {
    id: image.id,
    thumbnailUrl: image.thumbnail_url,
    imageUrl: image.image_url,
    similarityScore: 0,
    metadata: {
      width: image.width ?? null,
      height: image.height ?? null,
      source: image.source_type,
      status: image.status,
      ocrText: image.ocr_text ?? undefined,
    },
  }
}

function toAlbumPayload(form: AlbumFormState): AlbumCreatePayload {
  return {
    name: form.name.trim(),
    description: form.description.trim() || null,
    cover_image_id: null,
  }
}
