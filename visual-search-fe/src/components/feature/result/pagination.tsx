import { ChevronLeft, ChevronRight } from 'lucide-react'

import { Button } from '@/components/base/button'

interface PaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
  ariaLabel?: string
  previousLabel?: string
  nextLabel?: string
  scrollToTop?: boolean
  className?: string
}

export function Pagination({
  page,
  totalPages,
  onChange,
  ariaLabel = 'Pagination',
  previousLabel = 'Previous',
  nextLabel = 'Next',
  scrollToTop = true,
  className = '',
}: PaginationProps) {
  if (totalPages <= 1) return null

  function changePage(nextPage: number) {
    if (nextPage < 1 || nextPage > totalPages || nextPage === page) return
    onChange(nextPage)
    if (scrollToTop) {
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  return (
    <nav
      aria-label={ariaLabel}
      className={`flex flex-wrap items-center justify-center gap-3 border-t border-border pt-6 ${className}`}
    >
      <Button
        aria-label={`${previousLabel}, page ${Math.max(1, page - 1)}`}
        disabled={page <= 1}
        leftIcon={<ChevronLeft className="h-4 w-4" />}
        type="button"
        variant="outline"
        onClick={() => changePage(page - 1)}
      >
        {previousLabel}
      </Button>

      <span className="min-w-24 text-center text-sm font-semibold text-ink-secondary" aria-live="polite">
        {page} / {totalPages}
      </span>

      <Button
        aria-label={`${nextLabel}, page ${Math.min(totalPages, page + 1)}`}
        disabled={page >= totalPages}
        rightIcon={<ChevronRight className="h-4 w-4" />}
        type="button"
        variant="outline"
        onClick={() => changePage(page + 1)}
      >
        {nextLabel}
      </Button>
    </nav>
  )
}
