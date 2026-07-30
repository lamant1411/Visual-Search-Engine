import { useEffect, useRef, useState } from 'react'
import Cropper, { type Area, type MediaSize, type Size } from 'react-easy-crop'
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

type ResizeDirection = 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

const minCropSize = 80

const resizeHandles: Array<{ direction: ResizeDirection; className: string }> = [
  { direction: 'top-left', className: '-left-2 -top-2 cursor-nwse-resize' },
  { direction: 'top', className: 'left-1/2 -top-2 -translate-x-1/2 cursor-ns-resize' },
  { direction: 'top-right', className: '-right-2 -top-2 cursor-nesw-resize' },
  { direction: 'right', className: '-right-2 top-1/2 -translate-y-1/2 cursor-ew-resize' },
  { direction: 'bottom-right', className: '-bottom-2 -right-2 cursor-nwse-resize' },
  { direction: 'bottom', className: '-bottom-2 left-1/2 -translate-x-1/2 cursor-ns-resize' },
  { direction: 'bottom-left', className: '-bottom-2 -left-2 cursor-nesw-resize' },
  { direction: 'left', className: '-left-2 top-1/2 -translate-y-1/2 cursor-ew-resize' },
]

export function ImageCropModal({ file, imageUrl, onCancel, onConfirm, onUseOriginal }: ImageCropModalProps) {
  const [crop, setCrop] = useState({ x: 0, y: 0 })
  const [zoom, setZoom] = useState(1)
  const [cropSize, setCropSize] = useState<Size>()
  const [cropArea, setCropArea] = useState<Area>()
  const [errorMessage, setErrorMessage] = useState<string>()
  const [isProcessing, setIsProcessing] = useState(false)
  const maxCropSize = useRef<Size | undefined>(undefined)

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

  function handleMediaLoaded(mediaSize: MediaSize) {
    const maximumSize = {
      width: Math.floor(mediaSize.width),
      height: Math.floor(mediaSize.height),
    }

    maxCropSize.current = maximumSize
    setCropSize((currentSize) =>
      currentSize ?? {
        width: Math.min(maximumSize.width, Math.max(minCropSize, Math.floor(maximumSize.width * 0.72))),
        height: Math.min(maximumSize.height, Math.max(minCropSize, Math.floor(maximumSize.height * 0.72))),
      },
    )
  }

  function startResize(event: React.PointerEvent<HTMLButtonElement>, direction: ResizeDirection) {
    if (!cropSize || !maxCropSize.current) {
      return
    }

    event.preventDefault()
    event.stopPropagation()

    const startPoint = { x: event.clientX, y: event.clientY }
    const startSize = cropSize
    const maximumSize = maxCropSize.current

    function handlePointerMove(pointerEvent: PointerEvent) {
      const deltaX = pointerEvent.clientX - startPoint.x
      const deltaY = pointerEvent.clientY - startPoint.y
      const horizontalFactor = direction.includes('left') ? -2 : direction.includes('right') ? 2 : 0
      const verticalFactor = direction.includes('top') ? -2 : direction.includes('bottom') ? 2 : 0

      setCropSize({
        width: clamp(startSize.width + deltaX * horizontalFactor, minCropSize, maximumSize.width),
        height: clamp(startSize.height + deltaY * verticalFactor, minCropSize, maximumSize.height),
      })
    }

    function stopResize() {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', stopResize)
      window.removeEventListener('pointercancel', stopResize)
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', stopResize)
    window.addEventListener('pointercancel', stopResize)
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
            aspect={cropSize ? cropSize.width / cropSize.height : 4 / 3}
            crop={crop}
            cropSize={cropSize}
            image={imageUrl}
            maxZoom={3}
            minZoom={1}
            objectFit="contain"
            showGrid
            zoom={zoom}
            onCropChange={setCrop}
            onCropComplete={(_, croppedAreaPixels) => setCropArea(croppedAreaPixels)}
            onMediaLoaded={handleMediaLoaded}
            onZoomChange={setZoom}
          />

          {cropSize && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2"
              style={{ height: cropSize.height, width: cropSize.width }}
            >
              {resizeHandles.map(({ direction, className }) => (
                <button
                  key={direction}
                  aria-label={`Resize crop area from ${direction}`}
                  className={`pointer-events-auto absolute h-7 w-7 touch-none rounded-sm border-2 border-slate-950 bg-white shadow sm:h-4 sm:w-4 ${className}`}
                  title={`Resize from ${direction}`}
                  type="button"
                  onPointerDown={(event) => startResize(event, direction)}
                />
              ))}
            </div>
          )}
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

          <div className="grid grid-cols-1 gap-3 sm:flex sm:flex-wrap sm:justify-end">
            <Button className="min-h-11 sm:min-h-0" disabled={isProcessing} type="button" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button className="min-h-11 sm:min-h-0" disabled={isProcessing} type="button" variant="outline" onClick={onUseOriginal}>
              Use full image
            </Button>
            <Button
              className="min-h-11 !bg-ink-primary hover:!bg-slate-800 sm:min-h-0"
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

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), maximum)
}
