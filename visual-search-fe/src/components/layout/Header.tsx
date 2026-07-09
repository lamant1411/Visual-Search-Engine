import { type ChangeEvent, type FormEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { ChevronDown, Clock, FileText, ImagePlus, LogOut, ScanText, Search, Shield, X } from 'lucide-react';
import { Button } from '@/components/base/button';
import { useAuth } from '@/contexts/AuthContext';
import { validateSearchImageFile } from '@/features/search/utils/imageValidation';

type HeaderSearchMode = 'image' | 'semantic' | 'ocr';

const searchModeOptions = [
  { value: 'semantic', label: 'Ngữ nghĩa', icon: FileText },
  { value: 'ocr', label: 'OCR', icon: ScanText },
  { value: 'image', label: 'Ảnh', icon: ImagePlus },
] satisfies Array<{
  value: HeaderSearchMode;
  label: string;
  icon: typeof Search;
}>;

export function Header() {
  const navigate = useNavigate();
  const { isAuthenticated, logout, user } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [searchMode, setSearchMode] = useState<HeaderSearchMode>('semantic');
  const [query, setQuery] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const userDisplayName = user?.full_name?.trim() || user?.username || user?.email || 'Tài khoản';
  const userInitial = userDisplayName.charAt(0).toUpperCase();
  const selectedMode = searchModeOptions.find((mode) => mode.value === searchMode) ?? searchModeOptions[0];
  const SelectedModeIcon = selectedMode.icon;
  const canSubmitSearch = searchMode === 'image' ? Boolean(selectedFile) : query.trim().length > 0;

  async function handleLogout() {
    setIsAccountMenuOpen(false);
    setIsLoggingOut(true);
    await logout();
    setIsLoggingOut(false);
    navigate('/login', { replace: true });
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmitSearch) return;

    if (searchMode === 'image') {
      navigate('/search/results?mode=image&page=1&limit=20', {
        state: {
          file: selectedFile,
          fileName: selectedFile?.name,
        },
      });
      return;
    }

    navigate(`/search/results?mode=${searchMode}&q=${encodeURIComponent(query.trim())}&page=1&limit=20`);
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    const errorMessage = validateSearchImageFile(nextFile);
    if (!errorMessage) {
      setSelectedFile(nextFile);
    }

    event.target.value = '';
  }

  function handleModeChange(nextMode: HeaderSearchMode) {
    setSearchMode(nextMode);
    setSelectedFile(null);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link
          to="/search"
          className="group flex min-w-[150px] flex-col justify-center text-ink-primary transition hover:text-accent-700"
        >
          <span className="font-display text-[22px] font-black leading-6 tracking-normal">
            Visual<span className="text-accent-600">Search</span>
          </span>
          <span className="hidden text-[10px] font-extrabold uppercase tracking-normal text-ink-muted sm:block">
            Công cụ tìm kiếm ảnh
          </span>
        </Link>

        <form
          className="hidden h-11 min-w-0 max-w-2xl flex-1 items-center rounded-full border border-border bg-surface-1 shadow-sm shadow-slate-200/70 transition duration-200 focus-within:border-accent-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-accent-100 md:flex"
          onSubmit={handleSearchSubmit}
        >
          <label className="relative flex h-full shrink-0 cursor-pointer items-center gap-2 rounded-l-full border-r border-border bg-white px-3 text-sm font-bold text-ink-primary">
            <SelectedModeIcon className="h-4 w-4 text-accent-600" />
            <select
              className="cursor-pointer appearance-none bg-transparent pr-5 outline-none"
              value={searchMode}
              onChange={(event) => handleModeChange(event.target.value as HeaderSearchMode)}
            >
              {searchModeOptions.map((mode) => (
                <option key={mode.value} value={mode.value}>
                  {mode.label}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-400" />
          </label>

          {searchMode === 'image' ? (
            <label className="flex h-full min-w-0 flex-1 cursor-pointer items-center px-4 text-sm font-semibold text-ink-secondary">
              <input
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                type="file"
                onChange={handleFileChange}
              />
              <span className="truncate">{selectedFile?.name ?? 'Chọn ảnh để tìm'}</span>
            </label>
          ) : (
            <input
              className="h-full min-w-0 flex-1 bg-transparent px-4 text-sm font-semibold text-ink-primary outline-none placeholder:text-slate-400"
              value={query}
              placeholder={searchMode === 'semantic' ? 'Tìm theo mô tả...' : 'Tìm chữ trong ảnh...'}
              onChange={(event) => setQuery(event.target.value)}
            />
          )}

          {searchMode === 'image' && selectedFile && (
            <button
              aria-label="Xoá ảnh đã chọn"
              className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted transition hover:bg-accent-50 hover:text-ink-primary"
              type="button"
              onClick={() => setSelectedFile(null)}
            >
              <X className="h-4 w-4" />
            </button>
          )}

          <button
            aria-label="Tìm kiếm"
            className="mr-1 inline-flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink-primary text-white transition duration-200 hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
            disabled={!canSubmitSearch}
            type="submit"
          >
            <Search className="h-[18px] w-[18px]" />
          </button>
        </form>

        <nav className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            className="hidden h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-bold text-ink-secondary transition hover:bg-accent-50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 sm:inline-flex"
            onClick={() => navigate('/history')}
          >
            <Clock className="h-4 w-4" />
            <span className="hidden lg:inline">Lịch sử</span>
          </button>

          {user?.role === 'admin' && (
            <button
              type="button"
              className="hidden h-9 cursor-pointer items-center gap-2 rounded-full px-3 text-sm font-bold text-ink-secondary transition hover:bg-accent-50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 sm:inline-flex"
              onClick={() => navigate('/admin')}
            >
              <Shield className="h-4 w-4" />
              <span className="hidden lg:inline">Admin</span>
            </button>
          )}

          {isAuthenticated ? (
            <div
              className="relative"
              onMouseEnter={() => setIsAccountMenuOpen(true)}
              onMouseLeave={() => setIsAccountMenuOpen(false)}
              onFocus={() => setIsAccountMenuOpen(true)}
              onBlur={(event) => {
                const nextFocusedElement = event.relatedTarget as Node | null;
                if (!nextFocusedElement || !event.currentTarget.contains(nextFocusedElement)) {
                  setIsAccountMenuOpen(false);
                }
              }}
            >
              <button
                type="button"
                aria-haspopup="menu"
                aria-expanded={isAccountMenuOpen}
                aria-label={`Mở menu tài khoản ${userDisplayName}`}
                title={userDisplayName}
                className="inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-full border border-border bg-white text-ink-primary shadow-sm shadow-slate-200/70 transition hover:border-accent-200 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2"
                onClick={() => setIsAccountMenuOpen(true)}
              >
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-ink-primary">
                  {userInitial}
                </span>
              </button>

              <div
                role="menu"
                className={[
                  'absolute right-0 top-full mt-2 w-64 rounded-2xl border border-border bg-white p-2 text-left shadow-xl shadow-slate-200/80 transition duration-200',
                  isAccountMenuOpen
                    ? 'visible translate-y-0 opacity-100'
                    : 'invisible -translate-y-1 opacity-0 pointer-events-none',
                ].join(' ')}
              >
                <div className="border-b border-border px-3 py-2.5">
                  <p className="truncate text-sm font-bold text-ink-primary">{userDisplayName}</p>
                  {user?.email && <p className="mt-0.5 truncate text-xs font-medium text-ink-muted">{user.email}</p>}
                  <p className="mt-2 w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-ink-secondary">
                    {user?.role === 'admin' ? 'Admin' : 'Người dùng'}
                  </p>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  className="mt-2 flex h-10 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-bold text-ink-secondary transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                  disabled={isLoggingOut}
                  onClick={handleLogout}
                >
                  <LogOut className="h-4 w-4" />
                  {isLoggingOut ? 'Đang đăng xuất...' : 'Đăng xuất'}
                </button>
              </div>
            </div>
          ) : (
            <Button
              variant="primary"
              size="sm"
              className="rounded-full !bg-ink-primary shadow-sm shadow-slate-300/70 hover:!bg-slate-800"
              onClick={() => navigate('/login')}
            >
              Đăng nhập
            </Button>
          )}
        </nav>
      </div>
    </header>
  );
}
