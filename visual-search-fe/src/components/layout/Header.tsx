import {
  type ChangeEvent,
  type FormEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { Link, useNavigate } from "react-router";
import {
  Bookmark,
  ChevronDown,
  Clock,
  FileText,
  ImagePlus,
  Images,
  LogOut,
  Search,
  Shield,
  X,
} from "lucide-react";
import { Button } from "@/components/base/button";
import { useAuth } from "@/contexts/AuthContext";
import { SearchLoginModal } from "@/features/search/components/SearchLoginModal";
import { validateSearchImageFile } from "@/features/search/utils/imageValidation";

type HeaderSearchMode = "image" | "text";

const searchModeOptions = [
  { value: "text", label: "Text", icon: FileText },
  { value: "image", label: "Image", icon: ImagePlus },
] satisfies Array<{
  value: HeaderSearchMode;
  label: string;
  icon: typeof Search;
}>;

export function Header() {
  const navigate = useNavigate();
  const { isAuthenticated, isLoading: isAuthLoading, logout, user } = useAuth();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [searchMode, setSearchMode] = useState<HeaderSearchMode>("text");
  const [query, setQuery] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const [isSearchLoginOpen, setIsSearchLoginOpen] = useState(false);
  const [searchError, setSearchError] = useState<string>();
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const selectedFilePreviewUrlRef = useRef<string | null>(null);
  const [selectedFilePreviewUrl, setSelectedFilePreviewUrl] = useState<string | null>(null);
  const userDisplayName =
    user?.full_name?.trim() || user?.username || user?.email || "Account";
  const userInitial = userDisplayName.charAt(0).toUpperCase();
  const selectedMode =
    searchModeOptions.find((mode) => mode.value === searchMode) ??
    searchModeOptions[0];
  const SelectedModeIcon = selectedMode.icon;
  const canSubmitSearch =
    searchMode === "image" ? Boolean(selectedFile) : query.trim().length > 0;

  useEffect(() => {
    if (!isAccountMenuOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!accountMenuRef.current?.contains(event.target as Node)) {
        setIsAccountMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isAccountMenuOpen]);

  useEffect(() => {
    if (!isMobileSearchOpen || searchMode === "image") return;

    const timer = window.setTimeout(() => {
      mobileSearchInputRef.current?.focus();
    }, 80);

    return () => window.clearTimeout(timer);
  }, [isMobileSearchOpen, searchMode]);

  useEffect(() => {
    return () => {
      if (selectedFilePreviewUrlRef.current) {
        URL.revokeObjectURL(selectedFilePreviewUrlRef.current);
      }
    };
  }, []);

  async function handleLogout() {
    setIsAccountMenuOpen(false);
    setIsLoggingOut(true);
    await logout();
    setIsLoggingOut(false);
    navigate("/login", { replace: true });
  }

  function handleSearchSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canSubmitSearch) return;

    if (isAuthLoading) return;

    if (!isAuthenticated) {
      setIsSearchLoginOpen(true);
      return;
    }

    executeSearch();
  }

  function executeSearch() {
    setIsMobileSearchOpen(false);
    setSearchError(undefined);

    if (searchMode === "image") {
      navigate("/search/results?mode=image&page=1&limit=20", {
        state: {
          file: selectedFile,
          fileName: selectedFile?.name,
        },
      });
      return;
    }

    navigate(
      `/search/results?mode=text&q=${encodeURIComponent(query.trim())}&page=1&limit=20`,
    );
  }

  function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const nextFile = event.target.files?.[0];
    if (!nextFile) return;

    const errorMessage = validateSearchImageFile(nextFile);
    if (errorMessage) {
      clearSelectedImage();
      setSearchError(errorMessage);
      event.target.value = "";
      return;
    }

    if (selectedFilePreviewUrlRef.current) {
      URL.revokeObjectURL(selectedFilePreviewUrlRef.current);
    }

    const nextPreviewUrl = URL.createObjectURL(nextFile);
    selectedFilePreviewUrlRef.current = nextPreviewUrl;
    setSelectedFile(nextFile);
    setSelectedFilePreviewUrl(nextPreviewUrl);
    setSearchError(undefined);

    event.target.value = "";
  }

  function handleModeChange(nextMode: HeaderSearchMode) {
    setSearchMode(nextMode);
    clearSelectedImage();
    setSearchError(undefined);
  }

  function clearSelectedImage() {
    if (selectedFilePreviewUrlRef.current) {
      URL.revokeObjectURL(selectedFilePreviewUrlRef.current);
      selectedFilePreviewUrlRef.current = null;
    }

    setSelectedFile(null);
    setSelectedFilePreviewUrl(null);
    setSearchError(undefined);
  }

  return (
    <>
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
              Image search engine
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
                onChange={(event) =>
                  handleModeChange(event.target.value as HeaderSearchMode)
                }
              >
                {searchModeOptions.map((mode) => (
                  <option key={mode.value} value={mode.value}>
                    {mode.label}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2 h-4 w-4 text-slate-400" />
            </label>

            {searchMode === "image" ? (
              <label className="flex h-full min-w-0 flex-1 cursor-pointer items-center px-4 text-sm font-semibold text-ink-secondary">
                <input
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  type="file"
                  onChange={handleFileChange}
                />
                <span className="truncate">
                  {selectedFile?.name ?? "Choose an image"}
                </span>
              </label>
            ) : (
              <input
                aria-label="Search by text"
                className="h-full min-w-0 flex-1 bg-transparent px-4 text-base font-semibold text-ink-primary outline-none placeholder:text-slate-400 md:text-sm"
                value={query}
                placeholder="Describe an image or enter words from it..."
                onChange={(event) => {
                  setQuery(event.target.value);
                  setSearchError(undefined);
                }}
              />
            )}

            {searchMode === "image" && selectedFile && (
              <button
                aria-label="Remove selected image"
                className="inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted transition hover:bg-accent-50 hover:text-ink-primary"
                type="button"
                onClick={clearSelectedImage}
              >
                <X className="h-4 w-4" />
              </button>
            )}

            <button
              aria-label="Search"
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
              aria-controls="mobile-header-search"
              aria-expanded={isMobileSearchOpen}
              aria-label={isMobileSearchOpen ? "Close search" : "Open search"}
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-ink-secondary transition hover:bg-accent-50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 md:hidden"
              onClick={() => {
                setIsAccountMenuOpen(false);
                setIsMobileSearchOpen((isOpen) => !isOpen);
              }}
            >
              {isMobileSearchOpen ? (
                <X className="h-5 w-5" />
              ) : (
                <Search className="h-5 w-5" />
              )}
            </button>

            {user?.role === "admin" && (
              <button
                type="button"
                aria-label="Open admin dashboard"
                title="Admin dashboard"
                className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-ink-secondary transition hover:bg-accent-50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 lg:h-9 lg:w-auto lg:gap-2 lg:px-3"
                onClick={() => navigate("/admin")}
              >
                <Shield className="h-5 w-5 lg:h-4 lg:w-4" />
                <span className="hidden lg:inline">Admin</span>
              </button>
            )}

            {isAuthenticated ? (
              <div
                ref={accountMenuRef}
                className="relative"
                onMouseEnter={() => setIsAccountMenuOpen(true)}
                onMouseLeave={() => setIsAccountMenuOpen(false)}
                onFocus={() => setIsAccountMenuOpen(true)}
                onBlur={(event) => {
                  const nextFocusedElement = event.relatedTarget as Node | null;
                  if (
                    !nextFocusedElement ||
                    !event.currentTarget.contains(nextFocusedElement)
                  ) {
                    setIsAccountMenuOpen(false);
                  }
                }}
              >
                <button
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={isAccountMenuOpen}
                  aria-label={`Open account menu for ${userDisplayName}`}
                  title={userDisplayName}
                  className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-border bg-white text-ink-primary shadow-sm shadow-slate-200/70 transition hover:border-accent-200 hover:bg-accent-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600 focus-visible:ring-offset-2 md:h-10 md:w-10"
                  onClick={() => {
                    setIsMobileSearchOpen(false);
                    setIsAccountMenuOpen((isOpen) => !isOpen);
                  }}
                >
                  <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-black text-ink-primary">
                    {userInitial}
                  </span>
                </button>

                <div
                  className={[
                    "absolute right-0 top-full w-64 pt-2 transition duration-200",
                    isAccountMenuOpen
                      ? "visible translate-y-0 opacity-100"
                      : "invisible -translate-y-1 opacity-0 pointer-events-none",
                  ].join(" ")}
                >
                  <div
                    role="menu"
                    className="rounded-2xl border border-border bg-white p-2 text-left shadow-xl shadow-slate-200/80"
                  >
                    <div className="border-b border-border px-3 py-2.5">
                      <p className="truncate text-sm font-bold text-ink-primary">
                        {userDisplayName}
                      </p>
                      {user?.email && (
                        <p className="mt-0.5 truncate text-xs font-medium text-ink-muted">
                          {user.email}
                        </p>
                      )}
                      <p className="mt-2 w-fit rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-ink-secondary">
                        {user?.role === "admin" ? "Admin" : "User"}
                      </p>
                    </div>

                    <div className="py-1">

                      <button
                        type="button"
                        role="menuitem"
                        className="flex h-10 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-bold text-ink-secondary transition hover:bg-accent-50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          navigate("/images");
                        }}
                      >
                        <Images className="h-4 w-4" />
                        Image library
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-bold text-ink-secondary transition hover:bg-accent-50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          navigate("/history");
                        }}
                      >
                        <Clock className="h-4 w-4" />
                        Search history
                      </button>

                      <button
                        type="button"
                        role="menuitem"
                        className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-bold text-ink-secondary transition hover:bg-accent-50 hover:text-ink-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-600"
                        onClick={() => {
                          setIsAccountMenuOpen(false);
                          navigate("/bookmark");
                        }}
                      >
                        <Bookmark className="h-4 w-4" />
                        Bookmarks
                      </button>
                    </div>

                    <button
                      type="button"
                      role="menuitem"
                      className="mt-2 flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl px-3 text-sm font-bold text-ink-secondary transition hover:bg-red-50 hover:text-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500"
                      disabled={isLoggingOut}
                      onClick={handleLogout}
                    >
                      <LogOut className="h-4 w-4" />
                      {isLoggingOut ? "Signing out..." : "Sign out"}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <Button
                variant="primary"
                size="sm"
                className="min-h-11 rounded-full !bg-ink-primary px-4 shadow-sm shadow-slate-300/70 hover:!bg-slate-800 sm:min-h-0 sm:px-3"
                onClick={() => navigate("/login")}
              >
                Sign in
              </Button>
            )}
          </nav>
        </div>

        {isMobileSearchOpen && (
          <div
            id="mobile-header-search"
            className="border-t border-border px-4 py-3 md:hidden"
          >
            <form
              className="mx-auto flex h-12 max-w-xl items-center rounded-full border border-border bg-surface-1 shadow-sm focus-within:border-accent-600 focus-within:bg-white focus-within:ring-4 focus-within:ring-accent-100"
              onSubmit={handleSearchSubmit}
            >
              <label className="relative flex h-full shrink-0 cursor-pointer items-center gap-2 rounded-l-full border-r border-border bg-white px-3 text-sm font-bold text-ink-primary">
                <SelectedModeIcon className="h-4 w-4 text-accent-600" />
                <select
                  aria-label="Search mode"
                  className="w-20 cursor-pointer appearance-none bg-transparent pr-4 outline-none"
                  value={searchMode}
                  onChange={(event) =>
                    handleModeChange(event.target.value as HeaderSearchMode)
                  }
                >
                  {searchModeOptions.map((mode) => (
                    <option key={mode.value} value={mode.value}>
                      {mode.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-1.5 h-3.5 w-3.5 text-slate-400" />
              </label>

              {searchMode === "image" ? (
                <label className="flex h-full min-w-0 flex-1 cursor-pointer items-center px-3 text-sm font-semibold text-ink-secondary">
                  <input
                    accept="image/jpeg,image/png,image/webp"
                    className="sr-only"
                    type="file"
                    onChange={handleFileChange}
                  />
                  {selectedFilePreviewUrl && (
                    <img
                      alt=""
                      className="mr-2 h-8 w-8 shrink-0 rounded-md object-cover"
                      src={selectedFilePreviewUrl}
                    />
                  )}
                  <span className="truncate">
                    {selectedFile?.name ?? "Choose image"}
                  </span>
                </label>
              ) : (
                <input
                  ref={mobileSearchInputRef}
                  aria-label="Search by text"
                  aria-describedby={searchError ? "header-search-error" : undefined}
                  className="h-full min-w-0 flex-1 bg-transparent px-3 text-base font-semibold text-ink-primary outline-none placeholder:text-slate-400"
                  value={query}
                  placeholder="Describe or enter words..."
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setSearchError(undefined);
                  }}
                />
              )}

              {searchMode === "image" && selectedFile && (
                <button
                  aria-label="Remove selected image"
                  className="inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-ink-muted transition hover:bg-accent-50 hover:text-ink-primary"
                  type="button"
                  onClick={clearSelectedImage}
                >
                  <X className="h-4 w-4" />
                </button>
              )}

              <button
                aria-label="Search"
                className="mr-1 inline-flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-ink-primary text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:bg-slate-300"
                disabled={!canSubmitSearch}
                type="submit"
              >
                <Search className="h-[18px] w-[18px]" />
              </button>
            </form>
            {searchError && (
              <p
                id="header-search-error"
                className="mx-auto mt-2 max-w-xl text-sm font-semibold text-red-700"
                role="alert"
              >
                {searchError}
              </p>
            )}
          </div>
        )}

        {searchError && !isMobileSearchOpen && (
          <p className="border-t border-red-100 bg-red-50 px-4 py-2 text-center text-sm font-semibold text-red-700" role="alert">
            {searchError}
          </p>
        )}
      </header>

      {isSearchLoginOpen && (
        <SearchLoginModal
          onClose={() => setIsSearchLoginOpen(false)}
          onSuccess={() => {
            setIsSearchLoginOpen(false);
            executeSearch();
          }}
        />
      )}
    </>
  );
}
