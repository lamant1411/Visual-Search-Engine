import { FileText, Image, ScanText } from 'lucide-react'

import type { SearchMode } from '../types'

type SearchModeTabsProps = {
  value: SearchMode
  onChange: (mode: SearchMode) => void
}

const searchModes = [
  {
    value: 'image',
    label: 'Image',
    icon: Image,
  },
  {
    value: 'semantic',
    label: 'Semantic',
    icon: FileText,
  },
  {
    value: 'ocr',
    label: 'OCR',
    icon: ScanText,
  },
] satisfies Array<{
  value: SearchMode
  label: string
  icon: typeof FileText
}>

export function SearchModeTabs({ value, onChange }: SearchModeTabsProps) {
  return (
    <div className="flex w-full flex-col gap-2 rounded-xl border border-border bg-white p-2 shadow-sm sm:w-fit sm:flex-row">
      {searchModes.map((mode) => {
        const Icon = mode.icon
        const isActive = value === mode.value

        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            className={[
              'inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition',
              isActive
                ? 'bg-accent-600 text-white shadow-sm'
                : 'text-ink-secondary hover:bg-surface-1 hover:text-ink-primary',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <Icon className="h-4 w-4" />
            {mode.label}
          </button>
        )
      })}
    </div>
  )
}
