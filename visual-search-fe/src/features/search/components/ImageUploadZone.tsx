import type { DragEvent, ChangeEvent } from 'react'
import { ImagePlus, Trash2, Upload } from 'lucide-react'

import { Button } from '@/components/base/button'

type ImageUploadZoneProps = {
  file: File | null
  previewUrl: string | null
  errorMessage?: string
  onFileSelect: (file: File) => void
  onClear: () => void
}

export function ImageUploadZone({
  file,
  previewUrl,
  errorMessage,
  onFileSelect,
  onClear,
}: ImageUploadZoneProps) {
  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0]
    if (nextFile) {
      onFileSelect(nextFile)
    }

    event.target.value = ''
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()

    const nextFile = event.dataTransfer.files?.[0]
    if (nextFile) {
      onFileSelect(nextFile)
    }
  }

  function preventDefault(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault()
  }

  return (
    <div className="space-y-3">
      <label
        onDragEnter={preventDefault}
        onDragOver={preventDefault}
        onDrop={handleDrop}
        className={[
          'flex min-h-56 cursor-pointer items-center justify-center rounded-lg border border-dashed bg-surface-0 p-5 text-center transition duration-200 focus-within:ring-4 focus-within:ring-accent-100',
          errorMessage
            ? 'border-red-300 bg-red-50'
            : 'border-border hover:border-accent-600 hover:bg-white',
        ].join(' ')}
      >
        <input accept="image/jpeg,image/png,image/webp" className="sr-only" type="file" onChange={handleFileChange} />

        {previewUrl && file ? (
          <div className="grid w-full gap-4 text-left sm:grid-cols-[180px_1fr] sm:items-center">
            <img
              alt="Selected search image preview"
              className="h-44 w-full rounded-md object-cover sm:h-32"
              src={previewUrl}
            />

            <div>
              <p className="text-base font-semibold text-ink-primary">{file.name}</p>
              <p className="mt-1 text-sm text-ink-secondary">{formatFileSize(file.size)}</p>
              <p className="mt-3 text-sm text-accent-600">Click or drop another image to replace it.</p>
            </div>
          </div>
        ) : (
          <div>
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-white text-accent-600 shadow-sm shadow-slate-200/80">
              <ImagePlus className="h-6 w-6" />
            </span>
            <p className="mt-3 text-base font-semibold text-ink-primary">Upload an image</p>
            <p className="mt-1 text-sm text-ink-secondary">Drop a JPG, PNG, or WebP image here, or click to choose.</p>
          </div>
        )}
      </label>

      {errorMessage && <p className="text-sm font-medium text-red-600">{errorMessage}</p>}

      {file && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-white px-4 py-3 shadow-sm shadow-slate-200/70">
          <div className="flex items-center gap-2 text-sm text-ink-secondary">
            <Upload className="h-4 w-4 text-accent-600" />
            <span>Ready for image search</span>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            leftIcon={<Trash2 className="h-4 w-4" />}
            onClick={onClear}
          >
            Remove
          </Button>
        </div>
      )}
    </div>
  )
}

function formatFileSize(size: number) {
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}
