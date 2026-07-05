import type { ChangeEvent, FormEvent } from 'react'
import { ImagePlus, Search } from 'lucide-react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'

import type { SearchMode } from '../types'

type SearchPanelProps = {
  mode: SearchMode
  query: string
  selectedFileName: string
  onQueryChange: (query: string) => void
  onFileNameChange: (fileName: string) => void
  onSubmit: () => void
}

const placeholderByMode: Record<Exclude<SearchMode, 'image'>, string> = {
  semantic: 'Example: sunset on the beach',
  ocr: 'Example: SALE 50%',
}

export function SearchPanel({
  mode,
  query,
  selectedFileName,
  onQueryChange,
  onFileNameChange,
  onSubmit,
}: SearchPanelProps) {
  const isImageMode = mode === 'image'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    onFileNameChange(event.target.files?.[0]?.name ?? '')
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-xl border border-border bg-white p-5 shadow-sm"
    >
      {isImageMode ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-0 p-6 text-center">
          <ImagePlus className="mx-auto h-10 w-10 text-ink-muted" />
          <p className="mt-3 text-base font-semibold text-ink-primary">Image upload placeholder</p>
          <p className="mt-1 text-sm text-ink-secondary">Day 1 only shows the upload area. Drag & drop comes later.</p>

          <label className="mt-4 inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-border bg-white px-4 text-sm font-semibold text-ink-primary hover:bg-surface-1">
            Choose image
            <input accept="image/*" className="sr-only" type="file" onChange={handleFileChange} />
          </label>

          {selectedFileName && (
            <p className="mt-3 text-sm text-ink-secondary">
              Selected file: <span className="font-medium text-ink-primary">{selectedFileName}</span>
            </p>
          )}
        </div>
      ) : (
        <Input
          label={mode === 'semantic' ? 'Semantic search' : 'OCR search'}
          leftIcon={<Search className="h-5 w-5" />}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholderByMode[mode]}
          size="lg"
          value={query}
        />
      )}

      <div className="mt-5">
        <Button fullWidth leftIcon={<Search className="h-5 w-5" />} size="lg" type="submit">
          Search mock data
        </Button>
      </div>
    </form>
  )
}
