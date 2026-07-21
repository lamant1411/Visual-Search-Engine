import { FileText, Image, Layers3, ScanText } from 'lucide-react'
import type { SearchQueryType } from '@/lib/api/history'

type FilterType = 'all' | SearchQueryType

interface HistoryFiltersProps {
  activeFilter: FilterType
  counts: Record<FilterType, number>
  onChange: (filter: FilterType) => void
}

const filters = [
  { value: 'all', label: 'All', icon: Layers3 },
  { value: 'image', label: 'Image', icon: Image },
  { value: 'semantic', label: 'Semantic', icon: FileText },
  { value: 'ocr', label: 'OCR', icon: ScanText },
] satisfies Array<{ value: FilterType; label: string; icon: typeof Image }>

export function HistoryFilters({ activeFilter, counts, onChange }: HistoryFiltersProps) {
  return (
    <div
      role="group"
      aria-label="Filter search history"
      className="grid w-full grid-cols-2 gap-1 rounded-lg border border-border bg-surface-1 p-1 sm:flex sm:w-fit"
    >
      {filters.map(({ value, label, icon: Icon }) => {
        const isActive = activeFilter === value
        return (
          <button
            key={value}
            type="button"
            aria-pressed={isActive}
            onClick={() => onChange(value)}
            className={`flex h-8 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors sm:justify-start ${
              isActive
                ? 'bg-white text-ink-primary shadow-sm shadow-slate-200/70'
                : 'text-ink-secondary hover:bg-white/70 hover:text-ink-primary'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
            <span className={`text-3xs ${isActive ? 'text-accent-700' : 'text-ink-muted'}`}>
              {counts[value]}
            </span>
          </button>
        )
      })}
    </div>
  )
}
