import type { FormEvent } from 'react'
import { ArrowRight, Search } from 'lucide-react'

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
  semantic: 'Search by description',
  ocr: 'Search text in images',
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
      className="rounded-lg border border-border bg-white/95 p-3 shadow-xl shadow-slate-200/70 backdrop-blur"
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
            <button
              type="submit"
              className={[
                'inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2.5 rounded-full border text-base font-bold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                canSearch
                  ? 'border-ink-primary bg-ink-primary text-white shadow-sm shadow-slate-300/70 hover:bg-slate-800 active:bg-slate-900'
                  : 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400',
              ].join(' ')}
              disabled={!canSearch}
            >
              <span>Search</span>
              <ArrowRight className="h-5 w-5" />
            </button>
          </div>
        </>
      ) : (
        <div className="flex items-center gap-2">
          <div className="flex h-14 flex-1 items-center gap-3 rounded-full border border-border bg-surface-0 px-5 transition duration-200 focus-within:border-accent-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-accent-100">
            <Search className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2.25} />
            <input
              className="h-full w-full bg-transparent text-base font-bold text-ink-primary outline-none placeholder:font-medium placeholder:text-slate-400 sm:text-lg"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={placeholderByMode[mode]}
              value={query}
            />
          </div>

          <button
            aria-label="Search"
            className="inline-flex h-14 w-14 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink-primary text-white shadow-sm shadow-slate-300/70 transition duration-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
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
