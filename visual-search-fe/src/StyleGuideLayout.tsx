import { MemoryRouter } from 'react-router'

import { Header } from './components/layout/Header'
import { Sidebar } from './components/layout/Sidebar'
import { PageContainer } from './components/layout/PageContainer'

export default function StyleGuideLayout() {
  return (
    <MemoryRouter initialEntries={['/admin']}>
      <LayoutPreview />
    </MemoryRouter>
  )
}

function LayoutPreview() {
  return (
    <div className="min-h-screen bg-surface-0">
      <Header />

      <PageContainer size="wide">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-ink-primary">Layout Preview</h1>
          <p className="mt-2 text-ink-secondary">
            Demo layout components before real pages are connected.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[14rem_1fr]">
          <Sidebar />

          <div className="rounded-xl border border-border bg-surface-2 p-6">
            <h2 className="text-lg font-semibold text-ink-primary">Page content area</h2>
            <p className="mt-2 text-ink-secondary">
              Đây là vùng nội dung sẽ được render bằng Outlet sau này.
            </p>

            <div className="mt-6 grid gap-4 sm:grid-cols-3">
              <div className="rounded-lg border border-border bg-surface-1 p-4">Search page</div>
              <div className="rounded-lg border border-border bg-surface-1 p-4">History page</div>
              <div className="rounded-lg border border-border bg-surface-1 p-4">Admin page</div>
            </div>
          </div>
        </div>
      </PageContainer>
    </div>
  )
}
