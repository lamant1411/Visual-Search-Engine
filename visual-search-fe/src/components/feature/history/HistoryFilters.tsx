import React from 'react'
import { Image, Sparkles, ScanText, Layers } from 'lucide-react'
import type { SearchQueryType } from '@/lib/api/history'

type FilterType = 'all' | SearchQueryType

interface HistoryFiltersProps {
  activeFilter: FilterType
  onChange: (filter: FilterType) => void
}

export function HistoryFilters({ activeFilter, onChange }: HistoryFiltersProps) {
  const filters: { value: FilterType; label: string; icon: React.ReactNode }[] = [
    { value: 'all', label: 'Tất cả', icon: <Layers className="h-3.5 w-3.5" /> },
    { value: 'image', label: 'Hình ảnh', icon: <Image className="h-3.5 w-3.5" /> },
    { value: 'semantic', label: 'Nội dung ảnh', icon: <Sparkles className="h-3.5 w-3.5" /> },
    { value: 'ocr', label: 'Chữ trong ảnh', icon: <ScanText className="h-3.5 w-3.5" /> },
  ]

  return (
    <div className="flex flex-wrap gap-2 border-b border-border pb-4">
      {filters.map((filter) => {
        const isActive = activeFilter === filter.value
        return (
          <button
            key={filter.value}
            type="button"
            onClick={() => onChange(filter.value)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border transition-all duration-150 rounded-sm cursor-pointer ${isActive
              ? 'border-accent-600 bg-accent-50 text-accent-700'
              : 'border-border bg-surface-2 text-ink-secondary hover:bg-surface-1 hover:text-ink-primary'
              }`}
          >
            {filter.icon}
            <span>{filter.label}</span>
          </button>
        )
      })}
    </div>
  )
}
