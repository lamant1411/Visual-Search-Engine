import { ArrowLeft, Search } from 'lucide-react'
import { useNavigate } from 'react-router'

import { Button } from '@/components/base/button'

export default function NotFoundPage() {
  const navigate = useNavigate()

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface-0 px-5 py-16">
      <section className="w-full max-w-lg text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl border border-border bg-white text-ink-primary shadow-sm">
          <Search className="h-6 w-6" aria-hidden="true" />
        </div>
        <p className="mt-6 text-sm font-bold uppercase text-ink-muted">404</p>
        <h1 className="font-display mt-2 text-3xl font-bold text-ink-primary sm:text-4xl">
          This page could not be found
        </h1>
        <p className="mx-auto mt-3 max-w-md text-base leading-7 text-ink-secondary">
          The address may be incorrect or the page may have moved. Return to search to keep exploring.
        </p>
        <Button
          className="mt-7 !bg-ink-primary hover:!bg-slate-800"
          leftIcon={<ArrowLeft className="h-4 w-4" />}
          type="button"
          onClick={() => navigate('/search', { replace: true })}
        >
          Back to search
        </Button>
      </section>
    </main>
  )
}
