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
      className="rounded-xl border border-border bg-white p-5 shadow-sm"
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
          label={mode === 'semantic' ? 'Semantic search' : 'OCR search'}
          leftIcon={<Search className="h-5 w-5" />}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={placeholderByMode[mode]}
          size="lg"
          value={query}
        />
      )}

      <div className="mt-5">
        <Button disabled={!canSearch} fullWidth leftIcon={<Search className="h-5 w-5" />} size="lg" type="submit">
          Search mock data
        </Button>
      </div>
    </form>
  )
}
