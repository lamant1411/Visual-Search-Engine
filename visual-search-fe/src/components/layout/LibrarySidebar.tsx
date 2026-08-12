import { Home, FolderHeart, Trash2, Images, Sparkles } from 'lucide-react'

export type LibraryTab = 'home' | 'albums' | 'trash'

export interface LibrarySidebarProps {
  activeTab: LibraryTab
  onSelectTab: (tab: LibraryTab) => void
  counts?: {
    home?: number
    albums?: number
    trash?: number
  }
}

export function LibrarySidebar({ activeTab, onSelectTab, counts }: LibrarySidebarProps) {
  const items: Array<{
    id: LibraryTab
    label: string
    subtitle: string
    icon: typeof Home
    count?: number
    badgeColor?: string
  }> = [
    {
      id: 'home',
      label: 'Home',
      subtitle: 'All indexed images',
      icon: Home,
      count: counts?.home,
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-100',
    },
    {
      id: 'albums',
      label: 'Albums',
      subtitle: 'Personal collections',
      icon: FolderHeart,
      count: counts?.albums,
      badgeColor: 'bg-violet-50 text-violet-700 border-violet-100',
    },
    {
      id: 'trash',
      label: 'Trash',
      subtitle: 'Soft-deleted images',
      icon: Trash2,
      count: counts?.trash,
      badgeColor: 'bg-red-50 text-red-700 border-red-100',
    },
  ]

  return (
    <>
      {/* Mobile/Tablet Horizontal Navigation Bar */}
      <nav
        aria-label="Image library navigation (Mobile)"
        className="sticky top-16 z-30 flex gap-1.5 overflow-x-auto border-b border-border bg-white/95 p-2 backdrop-blur-md lg:hidden"
      >
        {items.map((item) => {
          const Icon = item.icon
          const isActive = activeTab === item.id
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelectTab(item.id)}
              className={[
                'flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-bold transition-all min-w-0',
                isActive
                  ? 'bg-slate-950 text-white shadow-sm'
                  : 'bg-surface-1 text-ink-secondary hover:bg-surface-2 hover:text-ink-primary',
              ].join(' ')}
            >
              <Icon className="h-4 w-4 shrink-0" />
              <span className="truncate max-w-[80px] sm:max-w-none">{item.label}</span>
              {typeof item.count === 'number' && (
                <span
                  className={[
                    'inline-flex h-5 min-w-[20px] shrink-0 items-center justify-center rounded-full px-1.5 text-[10px] font-black',
                    isActive
                      ? 'bg-white/20 text-white'
                      : 'bg-surface-2 text-ink-secondary',
                  ].join(' ')}
                >
                  {item.count.toLocaleString('en-US')}
                </span>
              )}
            </button>
          )
        })}
      </nav>

      {/* Desktop Vertical Sidebar */}
      <aside className="hidden w-64 shrink-0 lg:block xl:w-72">
        <div className="sticky top-24 space-y-4">
          <div className="overflow-hidden rounded-3xl border border-border bg-white p-4 shadow-sm shadow-slate-200/60">
            <div className="mb-4 flex items-center justify-between border-b border-border/60 pb-3.5">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-accent-600 text-white shadow-sm shadow-accent-500/30">
                  <Images className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-ink-muted truncate">Library Menu</h2>
                  <p className="text-sm font-black tracking-tight text-ink-primary truncate">Navigation</p>
                </div>
              </div>
              <Sparkles className="h-4 w-4 text-accent-500 shrink-0" />
            </div>

            <nav aria-label="Image library navigation" className="space-y-1.5">
              {items.map((item) => {
                const Icon = item.icon
                const isActive = activeTab === item.id

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={[
                      'group flex w-full items-center justify-between rounded-2xl p-3 text-left transition-all duration-200',
                      isActive
                        ? 'bg-slate-950 text-white shadow-md shadow-slate-950/10 ring-1 ring-slate-900'
                        : 'text-ink-secondary hover:bg-surface-1 hover:text-ink-primary',
                    ].join(' ')}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div
                        className={[
                          'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                          isActive
                            ? 'bg-white/10 text-white'
                            : 'bg-surface-1 text-ink-secondary group-hover:bg-white group-hover:text-ink-primary group-hover:shadow-sm',
                        ].join(' ')}
                      >
                        <Icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold">{item.label}</span>
                        <span
                          className={[
                            'block truncate text-[11px] font-medium',
                            isActive ? 'text-slate-300' : 'text-ink-muted',
                          ].join(' ')}
                        >
                          {item.subtitle}
                        </span>
                      </div>
                    </div>

                    {typeof item.count === 'number' && (
                      <span
                        className={[
                          'ml-2 inline-flex h-6 min-w-[24px] shrink-0 items-center justify-center rounded-full border px-2 text-xs font-black transition-colors',
                          isActive
                            ? 'border-white/20 bg-white/15 text-white'
                            : `${item.badgeColor ?? 'bg-surface-1 text-ink-secondary border-border'}`,
                        ].join(' ')}
                      >
                        {item.count.toLocaleString('en-US')}
                      </span>
                    )}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>
      </aside>
    </>
  )
}
