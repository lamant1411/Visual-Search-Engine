import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, Loader2, Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react'
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
  const [selectedAlbumId, setSelectedAlbumId] = useState<number | null>(null)
  const [selectedImage, setSelectedImage] = useState<AlbumImage | null>(null)
  const [editingAlbum, setEditingAlbum] = useState<Album | null>(null)
  const [form, setForm] = useState<AlbumFormState>(emptyForm)
  const [formError, setFormError] = useState<string | null>(null)
  const [mutatingImageId, setMutatingImageId] = useState<number | null>(null)

  const albumsQuery = useQuery({
    queryKey: ['albums'],
    queryFn: () => albumsApi.list({ page: 1, limit: ALBUM_PAGE_LIMIT }),
  })

  const albums = albumsQuery.data?.items ?? []
  const selectedAlbum = useMemo(
    () => albums.find((album) => album.id === selectedAlbumId) ?? albums[0] ?? null,
    [albums, selectedAlbumId],
  )
  const activeAlbumId = selectedAlbum?.id ?? null

  const imagesQuery = useQuery({
    queryKey: ['album-images', activeAlbumId],
    queryFn: () => albumsApi.listImages(activeAlbumId as number, { page: 1, limit: ALBUM_IMAGE_PAGE_LIMIT }),
    enabled: activeAlbumId !== null,
  })

  const invalidateAlbums = () => {
    void queryClient.invalidateQueries({ queryKey: ['albums'] })
    if (activeAlbumId !== null) {
      void queryClient.invalidateQueries({ queryKey: ['album-images', activeAlbumId] })
    }
  }

  const createMutation = useMutation({
    mutationFn: (payload: AlbumCreatePayload) => albumsApi.create(payload),
    onSuccess: (album) => {
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
      setEditingAlbum(null)
      invalidateAlbums()
    },
  })

  const removeImageMutation = useMutation({
    mutationFn: ({ albumId, imageId }: { albumId: number; imageId: number }) =>
      albumsApi.removeImage(albumId, imageId),
    onSuccess: () => {
      setSelectedImage(null)
      invalidateAlbums()
    },
  })

  const isSavingAlbum = createMutation.isPending || updateMutation.isPending
  const images = imagesQuery.data?.items ?? []
  const selectedResult = selectedImage ? albumImageToSearchResult(selectedImage) : null

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
              {!albumsQuery.isLoading && (
                <span className="inline-flex min-h-8 items-center rounded-full border border-border bg-white px-3 text-sm font-semibold text-ink-secondary shadow-sm">
                  {albumsQuery.data?.total ?? albums.length}
                </span>
              )}
            </div>
            <p className="mt-2 max-w-2xl text-sm text-ink-secondary sm:text-base">
              Manage your private albums here. Add images from Image Library, search results, or bookmark details using the Add to album action.
            </p>
          </div>
          <Button type="button" variant="outline" leftIcon={<RefreshCw className="h-4 w-4" />} onClick={() => invalidateAlbums()}>
            Refresh
          </Button>
        </header>

        <div className="grid gap-6 lg:grid-cols-[360px_minmax(0,1fr)]">
          <section className="space-y-4">
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

            <section className="rounded-3xl border border-border bg-white p-3 shadow-sm shadow-slate-200/70">
              {albumsQuery.isLoading ? (
                <div className="flex min-h-40 items-center justify-center text-sm font-semibold text-ink-secondary">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading albums...
                </div>
              ) : albums.length === 0 ? (
                <div className="p-6 text-center">
                  <FolderOpen className="mx-auto h-8 w-8 text-ink-muted" />
                  <p className="mt-3 text-sm font-bold text-ink-primary">No albums yet</p>
                  <p className="mt-1 text-sm text-ink-secondary">Create your first album, then add images from the image detail menu.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {albums.map((album) => (
                    <button
                      key={album.id}
                      type="button"
                      className={[
                        'flex w-full items-center gap-3 rounded-2xl border p-3 text-left transition',
                        selectedAlbum?.id === album.id
                          ? 'border-accent-200 bg-accent-50 text-ink-primary'
                          : 'border-transparent bg-white text-ink-secondary hover:border-border hover:bg-surface-1',
                      ].join(' ')}
                      onClick={() => setSelectedAlbumId(album.id)}
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
                <p className="mt-1 max-w-sm text-sm text-ink-secondary">Create or select an album to view and manage its images.</p>
              </div>
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
                        if (window.confirm(`Delete album "${selectedAlbum.name}"? Images will not be deleted.`)) {
                          deleteMutation.mutate(selectedAlbum.id)
                        }
                      }}
                    >
                      Delete album
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
                  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                    {images.map((image) => (
                      <AlbumImageCard
                        key={image.id}
                        image={image}
                        isRemoving={removeImageMutation.isPending}
                        onOpen={() => setSelectedImage(image)}
                        onRemove={() => removeImageMutation.mutate({ albumId: selectedAlbum.id, imageId: image.id })}
                      />
                    ))}
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

function AlbumImageCard({
  image,
  isRemoving,
  onOpen,
  onRemove,
}: {
  image: AlbumImage
  isRemoving: boolean
  onOpen: () => void
  onRemove: () => void
}) {
  return (
    <article className="overflow-hidden rounded-2xl border border-border bg-white shadow-sm shadow-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-slate-200/80">
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
