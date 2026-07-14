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
    <div className="grid w-full grid-cols-3 gap-1 rounded-full border border-border bg-white/95 p-1.5 shadow-sm shadow-slate-200/70 backdrop-blur sm:w-fit">
      {searchModes.map((mode) => {
        const Icon = mode.icon
        const isActive = value === mode.value

        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            className={[
              'inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-full px-3 text-sm font-bold transition duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 focus-visible:ring-offset-white sm:px-5',
              isActive
                ? 'bg-ink-primary text-white shadow-sm shadow-slate-300/70'
                : 'text-ink-secondary hover:bg-accent-50 hover:text-ink-primary',
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
