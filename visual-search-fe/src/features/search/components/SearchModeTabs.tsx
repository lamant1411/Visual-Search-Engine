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
    <div className="flex w-full flex-col gap-1 rounded-lg border border-slate-200 bg-white/90 p-1 shadow-sm shadow-slate-200/70 backdrop-blur sm:w-fit sm:flex-row">
      {searchModes.map((mode) => {
        const Icon = mode.icon
        const isActive = value === mode.value

        return (
          <button
            key={mode.value}
            type="button"
            onClick={() => onChange(mode.value)}
            className={[
              'inline-flex h-10 items-center justify-center gap-2 rounded-md px-4 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 focus-visible:ring-offset-2 focus-visible:ring-offset-white',
              isActive
                ? 'bg-slate-950 text-white shadow-sm shadow-slate-300/70'
                : 'text-slate-500 hover:bg-slate-50 hover:text-slate-950',
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
