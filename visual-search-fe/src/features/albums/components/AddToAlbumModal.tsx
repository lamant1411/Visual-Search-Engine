import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { FolderOpen, ImagePlus, Loader2, Plus, X } from 'lucide-react'

import { Button } from '@/components/base/button'
import { albumsApi, type Album } from '@/lib/api/albums'
import { useDialogAccessibility } from '@/lib/ui/useDialogAccessibility'

type AddToAlbumModalProps = {
  imageIds: number[]
  onClose: () => void
  onSuccess?: () => void
}

const ALBUM_PICKER_LIMIT = 100

export function AddToAlbumModal({ imageIds, onClose, onSuccess }: AddToAlbumModalProps) {
  const queryClient = useQueryClient()
  const dialogRef = useDialogAccessibility<HTMLDivElement>(onClose)
  const uniqueImageIds = useMemo(() => Array.from(new Set(imageIds)).filter((id) => Number.isInteger(id) && id > 0), [imageIds])
  const [albumName, setAlbumName] = useState('')
  const [albumDescription, setAlbumDescription] = useState('')
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const albumsQuery = useQuery({
    queryKey: ['albums', 'picker'],
    queryFn: () => albumsApi.list({ page: 1, limit: ALBUM_PICKER_LIMIT }),
  })

  const invalidateAlbumQueries = (albumId?: number) => {
    void queryClient.invalidateQueries({ queryKey: ['albums'] })
    void queryClient.invalidateQueries({ queryKey: ['albums', 'picker'] })
    if (albumId) {
      void queryClient.invalidateQueries({ queryKey: ['album-images', albumId] })
    }
  }

  const addMutation = useMutation({
    mutationFn: async (album: Album) => {
      return albumsApi.addImages(album.id, uniqueImageIds)
    },
    onSuccess: (response) => {
      invalidateAlbumQueries(response.album_id)
      if (response.failed_count > 0) {
        setErrorMessage(response.failed_items.map((item) => `Image #${item.image_id}: ${item.message}`).join('\n'))
        return
      }
      onSuccess?.()
      onClose()
    },
    onError: () => {
      setErrorMessage('Unable to add images to this album.')
    },
  })

  const createAndAddMutation = useMutation({
    mutationFn: async () => {
      const name = albumName.trim()
      if (!name) {
        throw new Error('Album name is required.')
      }
      const album = await albumsApi.create({
        name,
        description: albumDescription.trim() || null,
      })
      const result = await albumsApi.addImages(album.id, uniqueImageIds)
      return { album, result }
    },
    onSuccess: ({ album, result }) => {
      invalidateAlbumQueries(album.id)
      if (result.failed_count > 0) {
        setErrorMessage(result.failed_items.map((item) => `Image #${item.image_id}: ${item.message}`).join('\n'))
        return
      }
      setAlbumName('')
      setAlbumDescription('')
      onSuccess?.()
      onClose()
    },
    onError: (error) => {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to create album.')
    },
  })

  const isMutating = addMutation.isPending || createAndAddMutation.isPending
  const albums = albumsQuery.data?.items ?? []
  const imageCountLabel = uniqueImageIds.length === 1 ? '1 image' : `${uniqueImageIds.length} images`

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm"
      role="dialog"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-3xl bg-white p-5 shadow-2xl shadow-slate-950/20"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs font-bold uppercase text-accent-600">Add to album</p>
            <h2 className="mt-1 text-2xl font-black text-ink-primary">Choose an album</h2>
            <p className="mt-1 text-sm text-ink-secondary">Add {imageCountLabel} to an existing album or create a new one.</p>
          </div>
          <Button type="button" variant="ghost" size="icon" aria-label="Close" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {errorMessage && (
          <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-red-100 bg-red-50 p-3 text-sm font-semibold text-red-700">
            {errorMessage}
          </pre>
        )}

        <section className="mt-5 rounded-2xl border border-border bg-surface-1 p-4">
          <h3 className="text-sm font-bold text-ink-primary">Existing albums</h3>
          {albumsQuery.isLoading ? (
            <div className="mt-4 flex min-h-24 items-center justify-center text-sm font-semibold text-ink-secondary">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading albums...
            </div>
          ) : albums.length === 0 ? (
            <div className="mt-4 rounded-xl border border-dashed border-border bg-white p-5 text-center">
              <FolderOpen className="mx-auto h-7 w-7 text-ink-muted" />
              <p className="mt-2 text-sm font-bold text-ink-primary">No albums yet</p>
              <p className="mt-1 text-xs text-ink-secondary">Create an album below and the selected images will be added automatically.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {albums.map((album) => (
                <button
                  key={album.id}
                  type="button"
                  className="flex min-h-20 items-center gap-3 rounded-2xl border border-border bg-white p-3 text-left transition hover:border-accent-200 hover:bg-accent-50 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={isMutating}
                  onClick={() => addMutation.mutate(album)}
                >
                  {album.cover_image_url ? (
                    <img src={album.cover_image_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-surface-1 text-ink-muted">
                      <FolderOpen className="h-5 w-5" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink-primary">{album.name}</span>
                    <span className="mt-1 block text-xs font-semibold text-ink-muted">{album.image_count} images</span>
                  </span>
                  <ImagePlus className="h-4 w-4 shrink-0 text-accent-600" />
                </button>
              ))}
            </div>
          )}
        </section>

        <form
          className="mt-5 rounded-2xl border border-border bg-white p-4"
          onSubmit={(event) => {
            event.preventDefault()
            createAndAddMutation.mutate()
          }}
        >
          <h3 className="text-sm font-bold text-ink-primary">Create new album and add images</h3>
          <label className="mt-4 block text-sm font-bold text-ink-primary">
            Album name
            <input
              className="mt-2 h-11 w-full rounded-xl border border-border bg-white px-3 text-sm font-semibold outline-none transition focus:border-accent-600 focus:ring-4 focus:ring-accent-100"
              maxLength={255}
              value={albumName}
              onChange={(event) => setAlbumName(event.target.value)}
              placeholder="My album"
            />
          </label>
          <label className="mt-4 block text-sm font-bold text-ink-primary">
            Description
            <textarea
              className="mt-2 min-h-20 w-full resize-y rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium outline-none transition focus:border-accent-600 focus:ring-4 focus:ring-accent-100"
              maxLength={2000}
              value={albumDescription}
              onChange={(event) => setAlbumDescription(event.target.value)}
              placeholder="Optional"
            />
          </label>
          <div className="mt-4 flex justify-end">
            <Button
              type="submit"
              disabled={isMutating || uniqueImageIds.length === 0}
              leftIcon={createAndAddMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            >
              Create and add
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
