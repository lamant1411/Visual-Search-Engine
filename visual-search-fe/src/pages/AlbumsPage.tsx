import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Loader2, Pencil, Plus, RefreshCw, RotateCcw, Trash2, X } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/base/button'
import { PageContainer } from '@/components/layout/PageContainer'
import { SearchResultDetailModal } from '@/features/search/components/SearchResultDetailModal'
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

export default function AlbumsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { isBookmarked, toggleBookmark, isToggling } = useBookmarks()
  const [viewMode, setViewMode] = useState<AlbumViewMode>('active')
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null)
  const [selectedImage, setSelectedImage] = useState<AlbumImage | null>(null)
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
    () => displayedAlbums.find((album) => album.id === selectedAlbumId) ?? displayedAlbums[0] ?? null,
    [displayedAlbums, selectedAlbumId],
  )
  const activeAlbumId = selectedAlbum?.id ?? null

  const imagesQuery = useQuery({
    queryKey: ['album-images', activeAlbumId],
    queryFn: () => albumsApi.listImages(activeAlbumId as number, { page: 1, limit: ALBUM_IMAGE_PAGE_LIMIT }),
    enabled: activeAlbumId !== null,
  })

  const invalidateAlbums = () => {
    void queryClient.invalidateQueries({ queryKey: ['albums'] })
    void queryClient.invalidateQueries({ queryKey: ['albums', 'deleted'] })
    if (activeAlbumId !== null) {
      void queryClient.invalidateQueries({ queryKey: ['album-images', activeAlbumId] })
    }
  }

  const createMutation = useMutation({
    mutationFn: (payload: AlbumCreatePayload) => albumsApi.create(payload),
    onSuccess: (album) => {
      setViewMode('active')
      setSelectedAlbumId(album.id)
      setForm(emptyForm)
      setFormError(null)
      invalidateAlbums()
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({ albumId, payload }: { albumId: number; payload: AlbumCreatePayload }) =>
      albumsApi.update(albumId, payload),
    onSuccess: (album) => {
      setEditingAlbum(null)
      setSelectedAlbumId(album.id)
      setForm(emptyForm)
      setFormError(null)
      invalidateAlbums()
    },
  })

  const deleteMutation = useMutation({
    mutationFn: (albumId: number) => albumsApi.delete(albumId),
    onSuccess: () => {
      setSelectedAlbumId(null)
      setSelectedImage(null)
      setSelectedImageIds(new Set())
      setEditingAlbum(null)
      invalidateAlbums()
    },
  })

  const restoreMutation = useMutation({
    mutationFn: (albumId: number) => albumsApi.restore(albumId),
    onSuccess: (album) => {
      setViewMode('active')
      setSelectedAlbumId(album.id)
      invalidateAlbums()
    },
  })

  const permanentDeleteMutation = useMutation({
    mutationFn: (albumId: number) => albumsApi.permanentDelete(albumId),
    onSuccess: () => {
      setSelectedAlbumId(null)
      invalidateAlbums()
    },
  })

  const removeImageMutation = useMutation({
    mutationFn: ({ albumId, imageId }: { albumId: number; imageId: number }) =>
      albumsApi.removeImage(albumId, imageId),
    onSuccess: (_response, variables) => {
      setSelectedImage(null)
      setSelectedImageIds((current) => {
        const next = new Set(current)
        next.delete(variables.imageId)
        return next
      })
      invalidateAlbums()
    },
  })

  const bulkRemoveImagesMutation = useMutation({
    mutationFn: ({ albumId, imageIds }: { albumId: number; imageIds: number[] }) =>
      albumsApi.removeImages(albumId, imageIds),
    onSuccess: () => {
      setSelectedImageIds(new Set())
      invalidateAlbums()
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
  }

  function startEdit(album: Album) {
    setEditingAlbum(album)
    setForm({
      name: album.name,
      description: album.description ?? '',
    })
    setFormError(null)
  }

  function cancelEdit() {
    setEditingAlbum(null)
    setForm(emptyForm)
    setFormError(null)
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

    setMutatingImageId(selectedImage.id)
    try {
      await imageLibraryApi.delete(selectedImage.id)
      setSelectedImage(null)
      await imagesQuery.refetch()
      invalidateAlbums()
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

  return (
    <>
      <PageContainer size="wide" className="space-y-7 py-8 sm:py-10">
        <header className="flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-accent-600">Image organization</p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h1 className="font-display text-3xl font-bold text-ink-primary sm:text-4xl">Albums</h1>
              <span className="inline-flex min-h-8 items-center rounded-full border border-border bg-white px-3 text-sm font-semibold text-ink-secondary shadow-sm">
                {displayedTotal}
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm text-ink-secondary sm:text-base">
              Manage private albums, restore deleted albums, or permanently remove albums that are no longer needed.
            </p>
          </div>
          <Button type="button" variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => invalidateAlbums()}>
            Refresh
          </Button>
        </header>

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

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <section className="space-y-4">
            {!isDeletedView && (
              <form onSubmit={handleSubmitAlbum} className="rounded-3xl border border-border bg-white p-5 shadow-sm shadow-slate-200/70">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-base font-bold text-ink-primary">{editingAlbum ? 'Edit album' : 'Create album'}</h2>
                  {editingAlbum && (
                    <button
                      type="button"
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-ink-muted hover:bg-surface-1 hover:text-ink-primary"
                      onClick={cancelEdit}
                      aria-label="Cancel editing album"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </div>

                <label className="mt-4 block text-sm font-bold text-ink-primary">
                  Name
                  <input
                    className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold outline-none transition focus:border-accent-600 focus:ring-4 focus:ring-accent-100"
                    value={form.name}
                    maxLength={255}
                    onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                    placeholder="Travel screenshots"
                  />
                </label>

                <label className="mt-4 block text-sm font-bold text-ink-primary">
                  Description
                  <textarea
                    className="mt-2 min-h-24 w-full resize-y rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium outline-none transition focus:border-accent-600 focus:ring-4 focus:ring-accent-100"
                    value={form.description}
                    maxLength={2000}
                    onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
                    placeholder="Optional notes for this album"
                  />
                </label>

                {formError && <p className="mt-3 text-sm font-semibold text-red-700">{formError}</p>}
                {(createMutation.error || updateMutation.error) && (
                  <p className="mt-3 text-sm font-semibold text-red-700">Unable to save album. Check the data and try again.</p>
                )}

                <Button
                  type="submit"
                  className="mt-5 w-full"
                  leftIcon={isSavingAlbum ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  disabled={isSavingAlbum}
                >
                  {editingAlbum ? 'Save changes' : 'Create album'}
                </Button>
              </form>
            )}

            <section className="rounded-3xl border border-border bg-white p-3 shadow-sm shadow-slate-200/70">
              {(viewMode === 'active' ? albumsQuery.isLoading : deletedAlbumsQuery.isLoading) ? (
                <div className="flex min-h-40 items-center justify-center text-sm font-semibold text-ink-secondary">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading albums...
                </div>
              ) : displayedAlbums.length === 0 ? (
                <div className="p-6 text-center">
                  <FolderOpen className="mx-auto h-8 w-8 text-ink-muted" />
                  <p className="mt-3 text-sm font-bold text-ink-primary">{isDeletedView ? 'No deleted albums' : 'No albums yet'}</p>
                  <p className="mt-1 text-sm text-ink-secondary">
                    {isDeletedView ? 'Deleted albums will appear here for restore or permanent deletion.' : 'Create your first album, then add images from the image detail menu.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  {displayedAlbums.map((album) => (
                    <button
                      key={album.id}
                      type="button"
                      className={[
                        'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition',
                        selectedAlbum?.id === album.id
                          ? 'border-accent-200 bg-accent-50 text-ink-primary'
                          : 'border-transparent bg-white text-ink-secondary hover:border-border hover:bg-surface-1',
                      ].join(' ')}
                      onClick={() => {
                        setSelectedAlbumId(album.id)
                        setSelectedImage(null)
                        setSelectedImageIds(new Set())
                      }}
                    >
                      {album.cover_image_url ? (
                        <img src={album.cover_image_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                      ) : (
                        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-1 text-ink-muted">
                          <FolderOpen className="h-5 w-5" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{album.name}</span>
                        <span className="mt-1 block text-xs font-semibold text-ink-muted">{album.image_count} images</span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </section>

          <section className="min-h-[560px] rounded-3xl border border-border bg-white p-5 shadow-sm shadow-slate-200/70">
            {!selectedAlbum ? (
              <div className="flex min-h-[480px] flex-col items-center justify-center text-center">
                <FolderOpen className="h-10 w-10 text-ink-muted" />
                <p className="mt-3 text-base font-bold text-ink-primary">Select an album</p>
                <p className="mt-1 max-w-sm text-sm text-ink-secondary">Create or select an album to view and manage it.</p>
              </div>
            ) : isDeletedView ? (
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
            ) : (
              <div className="space-y-5">
                <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase text-accent-600">Album detail</p>
                    <h2 className="mt-1 text-2xl font-black text-ink-primary">{selectedAlbum.name}</h2>
                    {selectedAlbum.description && <p className="mt-2 max-w-2xl text-sm text-ink-secondary">{selectedAlbum.description}</p>}
                    <p className="mt-2 text-xs font-bold text-ink-muted">{selectedAlbum.image_count} active images</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
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

                <div className="rounded-2xl border border-dashed border-border bg-surface-1 p-4">
                  <p className="text-sm font-bold text-ink-primary">Add images to this album</p>
                  <p className="mt-1 text-sm text-ink-secondary">
                    Open an image from Image Library, search results, or bookmarks and choose Add to album. You can also select multiple images in Image Library and add them together.
                  </p>
                </div>

                {imagesQuery.isLoading ? (
                  <div className="flex min-h-64 items-center justify-center text-sm font-semibold text-ink-secondary">
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading images...
                  </div>
                ) : images.length === 0 ? (
                  <div className="rounded-2xl border border-border bg-surface-1 p-10 text-center">
                    <FolderOpen className="mx-auto h-8 w-8 text-ink-muted" />
                    <p className="mt-3 text-sm font-bold text-ink-primary">No active images in this album</p>
                    <p className="mt-1 text-sm text-ink-secondary">Use Add to album from an image detail view. Deleted images are hidden until restored.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-col gap-3 rounded-2xl border border-border bg-surface-1 p-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm font-semibold text-ink-secondary">{selectedImageCount} selected</p>
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
                    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                      {images.map((image) => (
                      <AlbumImageCard
                        key={image.id}
                        image={image}
                        isRemoving={removeImageMutation.isPending || bulkRemoveImagesMutation.isPending}
                        isSelected={selectedImageIds.has(image.id)}
                        onToggleSelect={() => toggleSelectedImage(image.id)}
                        onOpen={() => setSelectedImage(image)}
                        onRemove={() => removeImageMutation.mutate({ albumId: selectedAlbum.id, imageId: image.id })}
                      />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
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
            <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {images.map((image) => (
                <ReadOnlyAlbumImageCard key={image.id} image={image} />
              ))}
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

function ReadOnlyAlbumImageCard({ image }: { image: AlbumImage }) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm shadow-slate-200/70">
      <img src={image.thumbnail_url} alt={image.original_filename ?? `Image ${image.id}`} className="h-44 w-full bg-surface-1 object-cover" />
      <div className="space-y-2 p-3">
        <p className="truncate text-sm font-bold text-ink-primary">{image.original_filename ?? `Image #${image.id}`}</p>
        <p className="text-xs font-semibold text-ink-muted">#{image.id} - {image.status}</p>
      </div>
    </article>
  )
}
function AlbumImageCard({
  image,
  isRemoving,
  isSelected,
  onToggleSelect,
  onOpen,
  onRemove,
}: {
  image: AlbumImage
  isRemoving: boolean
  isSelected: boolean
  onToggleSelect: () => void
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <article className={[
      'relative overflow-hidden rounded-2xl border bg-white shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/80',
      isSelected ? 'border-accent-500 ring-4 ring-accent-100' : 'border-border',
    ].join(' ')}>
      <label className="absolute left-3 top-3 z-10 inline-flex h-5 w-5 items-center justify-center" onClick={(event) => event.stopPropagation()}>
        <input
          type="checkbox"
          className="h-4 w-4 accent-accent-600"
          checked={isSelected}
          onChange={onToggleSelect}
          aria-label={`Select image ${image.id}`}
        />
      </label>
      <button type="button" className="block w-full text-left" onClick={onOpen}>
        <img src={image.thumbnail_url} alt={image.original_filename ?? `Image ${image.id}`} className="h-44 w-full bg-surface-1 object-cover" />
        <div className="space-y-3 p-3">
          <div>
            <p className="truncate text-sm font-bold text-ink-primary">{image.original_filename ?? `Image #${image.id}`}</p>
            <p className="mt-1 text-xs font-semibold text-ink-muted">#{image.id} - {image.status}</p>
          </div>
        </div>
      </button>
      <div className="px-3 pb-3">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={isRemoving}
          leftIcon={<X className="h-4 w-4" />}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          Remove from album
        </Button>
      </div>
    </article>
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
