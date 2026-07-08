import type { FormEvent } from 'react'
import { Search } from 'lucide-react'

import { Button } from '@/components/base/button'
import { Input } from '@/components/base/input'

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
      className="rounded-lg border border-white/80 bg-white/90 p-4 shadow-xl shadow-slate-200/70 backdrop-blur"
    >
      {isImageMode ? (
        <ImageUploadZone
          errorMessage={uploadError}
          file={selectedFile}
          previewUrl={previewUrl}
          onClear={onClearFile}
          onFileSelect={onFileSelect}
        />
      ) : (
        <Input
          leftIcon={<Search className="h-5 w-5" />}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholderByMode[mode]}
          size="lg"
          value={query}
          className="h-14 border-transparent bg-surface-0 text-lg shadow-none"
        />
      )}

      <div className="mt-4">
        <Button
          className="h-12 bg-slate-950 hover:bg-slate-800 active:bg-slate-900"
          disabled={!canSearch}
          fullWidth
          leftIcon={<Search className="h-5 w-5" />}
          size="lg"
          type="submit"
        >
          Search
        </Button>
      </div>
    </form>
  )
}
