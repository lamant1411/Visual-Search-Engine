import { useEffect, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { Crop, Minus, Plus, X } from 'lucide-react'

import { Button } from '@/components/base/button'

import { cropImageFile } from '../utils/cropImage'

type ImageCropModalProps = {
  file: File
  imageUrl: string
  onCancel: () => void
  onConfirm: (file: File) => void
  onUseOriginal: () => void
}

export function ImageCropModal({ file, imageUrl, onCancel, onConfirm, onUseOriginal }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [cropArea, setCropArea] = useState<Area>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [isProcessing, setIsProcessing] = useState(false)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !isProcessing) {
        onCancel()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = previousOverflow
    }
  }, [isProcessing, onCancel])

  async function handleApplyCrop() {
    if (!cropArea) {
      return
    }

    setErrorMessage(undefined)
    setIsProcessing(true)

    try {
      const croppedFile = await cropImageFile(file, imageUrl, cropArea)
      onConfirm(croppedFile)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to crop this image.')
    } finally {
      setIsProcessing(false)
    }
  }

  return (
    <div
      aria-labelledby="image-crop-title"
      aria-modal="true"
      className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-sm"
      role="dialog"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isProcessing) {
          onCancel()
        }
      }}
    >
      <section className="w-full max-w-2xl overflow-hidden rounded-lg bg-white shadow-2xl">
        <header className="flex items-center justify-between gap-4 border-b border-border px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase text-accent-600">Image search</p>
            <h2 id="image-crop-title" className="font-display mt-1 text-xl font-bold text-ink-primary">
              Choose the area to search
            </h2>
          </div>

          <Button
            aria-label="Close image crop"
            disabled={isProcessing}
            size="icon"
            type="button"
            variant="ghost"
            onClick={onCancel}
          >
            <X className="h-5 w-5" />
          </Button>
        </header>

        <div className="relative h-[min(58vh,480px)] min-h-[320px] bg-slate-950">
          <Cropper
            aspect={1}
            crop={crop}
            image={imageUrl}
            maxZoom={3}
            minZoom={1}
            objectFit="contain"
            showGrid
            zoom={zoom}
            onCropChange={setCrop}
            onCropComplete={(_, croppedAreaPixels) => setCropArea(croppedAreaPixels)}
            onZoomChange={setZoom}
          />
        </div>

        <div className="space-y-4 px-5 py-5">
          <div className="flex items-center gap-3">
            <Minus className="h-4 w-4 shrink-0 text-ink-muted" />
            <label className="sr-only" htmlFor="crop-zoom">
              Image zoom
            </label>
            <input
              id="crop-zoom"
              aria-label="Image zoom"
              className="h-2 w-full cursor-pointer accent-slate-900"
              max="3"
              min="1"
              step="0.05"
              type="range"
              value={zoom}
              onChange={(event) => setZoom(Number(event.target.value))}
            />
            <Plus className="h-4 w-4 shrink-0 text-ink-muted" />
            <span className="w-12 text-right text-xs font-bold tabular-nums text-ink-secondary">
              {Math.round(zoom * 100)}%
            </span>
          </div>

          {errorMessage && <p className="text-sm font-medium text-red-600">{errorMessage}</p>}

          <div className="flex flex-wrap justify-end gap-3">
            <Button disabled={isProcessing} type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button disabled={isProcessing} type="button" variant="outline" onClick={onUseOriginal}>
              Use full image
            </Button>
            <Button
              className="!bg-ink-primary hover:!bg-slate-800"
              disabled={!cropArea}
              leftIcon={<Crop className="h-4 w-4" />}
              loading={isProcessing}
              type="button"
              onClick={handleApplyCrop}
            >
              Apply crop
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}
