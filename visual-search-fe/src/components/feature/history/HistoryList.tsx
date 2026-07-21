import { Clock3, Search } from 'lucide-react'
import { HistoryItem } from './HistoryItem'
import { Skeleton } from '@/components/base/loader'
import type { HistoryItem as HistoryItemType } from '@/lib/api/history'

interface HistoryListProps {
  items: HistoryItemType[]
  isLoading: boolean
  emptyForFilter: boolean
  onReSearch: (item: HistoryItemType) => void
}

export function HistoryList({
  items,
  isLoading,
  emptyForFilter,
  onReSearch,
}: HistoryListProps) {
  if (isLoading) {
    return (
      <div className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white">
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className="flex items-center gap-3 px-4 py-4 sm:px-5">
            <Skeleton width={80} height={64} rounded={false} />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton width={150} height={13} rounded={false} />
              <Skeleton width="60%" height={16} rounded={false} />
            </div>
            <Skeleton width={72} height={32} rounded={false} />
          </div>
        ))}
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <section className="flex min-h-64 flex-col items-center justify-center rounded-lg border border-dashed border-border bg-surface-1 px-5 py-12 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-white text-ink-muted shadow-sm shadow-slate-200/60">
          {emptyForFilter ? <Search className="h-5 w-5" /> : <Clock3 className="h-5 w-5" />}
        </div>
        <h2 className="mt-4 text-sm font-bold text-ink-primary">
          {emptyForFilter ? 'No searches match this filter' : 'No search history yet'}
        </h2>
        <p className="mt-1 max-w-sm text-xs leading-5 text-ink-secondary">
          {emptyForFilter
            ? 'Choose another search type to see the rest of your history.'
            : 'Semantic, OCR, and image searches will appear here after they complete.'}
        </p>
      </section>
    )
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-white shadow-sm shadow-slate-200/40">
      {items.map((item) => (
        <HistoryItem
          key={item.id}
          item={item}
          onReSearch={onReSearch}
        />
      ))}
    </ul>
  )
}
