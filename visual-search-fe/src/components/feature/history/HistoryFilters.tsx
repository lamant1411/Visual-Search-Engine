import { FileText, Image, Layers3 } from 'lucide-react'
import type { HistoryFilterType } from '@/lib/api/history'

interface HistoryFiltersProps {
  activeFilter: HistoryFilterType
  onChange: (filter: HistoryFilterType) => void
}

const filters = [
  { value: 'all', label: 'All', icon: Layers3 },
  { value: 'text', label: 'Text', icon: FileText },
  { value: 'image', label: 'Image', icon: Image },
] satisfies Array<{ value: HistoryFilterType; label: string; icon: typeof Image }>

export function HistoryFilters({ activeFilter, onChange }: HistoryFiltersProps) {
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
            className={`flex min-h-11 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition-colors sm:h-8 sm:min-h-0 sm:justify-start ${
              isActive
                ? 'bg-white text-ink-primary shadow-sm shadow-slate-200/70'
                : 'text-ink-secondary hover:bg-white/70 hover:text-ink-primary'
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
