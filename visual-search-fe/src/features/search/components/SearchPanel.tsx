import type { FormEvent } from 'react'
import { ArrowRight, Search } from 'lucide-react'

import { Button } from '@/components/base/button'

import { ImageUploadZone } from './ImageUploadZone'
import type { SearchMode } from '../types'

type SearchPanelProps = {
  mode: SearchMode
  query: string
  selectedFile: File | null
  previewUrl: string | null
  uploadError?: string
  canSearch: boolean
  onQueryChange: (query: string) => void
  onFileSelect: (file: File) => void
  onClearFile: () => void
  onSubmit: () => void
}

const placeholderByMode: Record<Exclude<SearchMode, 'image'>, string> = {
  semantic: 'Example: sunset on the beach',
  ocr: 'Example: SALE 50%',
}

export function SearchPanel({
  mode,
  query,
  selectedFile,
  previewUrl,
  uploadError,
  canSearch,
  onQueryChange,
  onFileSelect,
  onClearFile,
  onSubmit,
}: SearchPanelProps) {
  const isImageMode = mode === 'image'

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    onSubmit()
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-lg border border-white/80 bg-white/95 p-3 shadow-2xl shadow-slate-300/35 backdrop-blur"
    >
      {isImageMode ? (
        <>
          <ImageUploadZone
            errorMessage={uploadError}
            file={selectedFile}
            previewUrl={previewUrl}
            onClear={onClearFile}
            onFileSelect={onFileSelect}
          />

          <div className="mt-4">
            <Button
              className="h-12 rounded-full bg-slate-950 hover:bg-slate-800 active:bg-slate-900"
              disabled={!canSearch}
              fullWidth
              rightIcon={<ArrowRight className="h-5 w-5" />}
              size="lg"
              type="submit"
            >
              Search
            </Button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex h-14 flex-1 items-center gap-3 rounded-full bg-surface-0 px-5">
            <Search className="h-5 w-5 shrink-0 text-ink-muted" />
            <input
              className="h-full w-full bg-transparent text-base font-medium text-ink-primary outline-none placeholder:text-ink-muted sm:text-lg"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={placeholderByMode[mode]}
              value={query}
            />
          </div>

          <button
            aria-label="Search"
            className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-45"
            disabled={!canSearch}
            type="submit"
          >
            <ArrowRight className="h-5 w-5" />
          </button>
        </div>
      )}
    </form>
  )
}
