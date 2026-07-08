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
      className="rounded-lg border border-slate-200/80 bg-white/95 p-2.5 shadow-lg shadow-slate-200/80 backdrop-blur"
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
                'inline-flex h-12 w-full items-center justify-center gap-2.5 rounded-full border text-base font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
                canSearch
                  ? 'border-slate-950 bg-slate-950 text-white hover:bg-slate-800 active:bg-slate-900'
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
          <div className="flex h-14 flex-1 items-center gap-3 rounded-full border border-transparent bg-slate-50 px-5 transition focus-within:border-slate-300 focus-within:bg-white">
            <Search className="h-5 w-5 shrink-0 text-slate-400" strokeWidth={2.25} />
            <input
              className="h-full w-full bg-transparent text-base font-semibold text-slate-950 outline-none placeholder:font-medium placeholder:text-slate-400 sm:text-lg"
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder={placeholderByMode[mode]}
              value={query}
            />
          </div>

          <button
            aria-label="Search"
            className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-950 text-white shadow-sm shadow-slate-300/80 transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300 disabled:shadow-none"
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
