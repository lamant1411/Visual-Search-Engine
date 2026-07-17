import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocation, useSearchParams } from "react-router";

import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/base/button";
import { Skeleton } from "@/components/base/loader";

import { ResultGrid } from "../components/ResultGrid";
import { SearchResultDetailModal } from "../components/SearchResultDetailModal";
import { searchByImage, searchByText } from "../services/search.api";
import { useBookmarks } from "../hooks/useBookmarks";
import type { SearchMode, SearchResponse, SearchResult } from "../types";
import { getSearchErrorMessage } from "../utils/getSearchErrorMessage";

type SearchLocationState = {
  file?: File;
  fileName?: string;
};

const pageLimit = 20;

const modeLabel: Record<SearchMode, string> = {
  image: "IMAGE SEARCH",
  semantic: "SEMANTIC SEARCH",
  ocr: "OCR SEARCH",
};

export function SearchResultsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const state = (location.state ?? {}) as SearchLocationState;

  const mode = parseSearchMode(searchParams.get("mode"));
  const query = searchParams.get("q") ?? "";
  const imageId = parseOptionalPositiveNumber(searchParams.get("imageId"));
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(
    null,
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const resultTitle = getResultTitle(mode, query, state.fileName, imageId);
  const queryEnabled =
    mode === "image" ? Boolean(state.file || imageId) : query.trim().length > 0;
  const imageSearchKey = state.file
    ? `${state.file.name}-${state.file.size}-${state.file.lastModified}`
    : imageId
      ? `image-${imageId}`
      : "no-image";
  const searchQuery = useInfiniteQuery({
    queryKey: [
      "search-results",
      mode,
      query,
      imageId,
      pageLimit,
      imageSearchKey,
    ],
    queryFn: ({ pageParam }) =>
      runSearch({
        mode,
        query,
        imageId,
        page: pageParam,
        limit: pageLimit,
        file: state.file,
      }),
    enabled: queryEnabled,
    initialPageParam: 1,
    getNextPageParam: (lastPage, pages) => {
      const loadedCount = pages.reduce(
        (count, currentPage) => count + currentPage.items.length,
        0,
      );

      if (lastPage.items.length < pageLimit || loadedCount >= lastPage.total) {
        return undefined;
      }

      return lastPage.page + 1;
    },
  });

  const results = useMemo(() => {
    const seenIds = new Set<number>();

    return (searchQuery.data?.pages ?? [])
      .flatMap((response) => response.items)
      .filter((result) => {
        if (seenIds.has(result.id)) {
          return false;
        }

        seenIds.add(result.id);
        return true;
      });
  }, [searchQuery.data]);
  const searchError = getSearchErrorMessage(searchQuery.error);
  const total = searchQuery.data?.pages[0]?.total ?? 0;
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = searchQuery;

  useEffect(() => {
    const target = loadMoreRef.current;
    if (!target || !queryEnabled || !hasNextPage) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: "500px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage, queryEnabled]);

  return (
    <div className="min-h-screen bg-surface-0">
      <PageContainer size="wide" className="max-w-7xl space-y-6 pb-10 pt-8">
        <section className="text-center">
          <p className="text-xs font-bold uppercase text-accent-600">
            {modeLabel[mode]}
          </p>
          <h1 className="font-display mt-2 text-3xl font-bold text-ink-primary sm:text-4xl">
            {resultTitle}
          </h1>
        </section>

        {queryEnabled ? (
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-bold text-ink-primary">
                {total} results
              </p>
              <p className="mt-1 text-sm text-ink-secondary">
                Loaded {results.length} of {total}. Sorted by highest
                similarity.
              </p>
            </div>

            <span className="w-fit rounded-full border border-border bg-white px-3 py-1 text-xs font-bold text-ink-secondary shadow-sm shadow-slate-200/70">
              20 images per batch
            </span>
          </div>
        ) : (
          <section className="rounded-lg border border-border bg-white p-6 text-center shadow-sm shadow-slate-200/70">
            <p className="font-semibold text-ink-primary">
              Start a search to view results
            </p>
            <p className="mt-2 text-sm text-ink-secondary">
              Enter a description, OCR text, or choose a reference image above.
            </p>
          </section>
        )}

        {queryEnabled && searchQuery.isLoading && (
          <ResultGridSkeleton limit={pageLimit} />
        )}

        {queryEnabled && searchQuery.isError && results.length === 0 && (
          <section className="rounded-lg border border-red-200 bg-red-50 p-6">
            <p className="font-semibold text-red-700">{searchError.title}</p>
            <p className="mt-1 text-sm text-red-600">
              {searchError.description}
            </p>
          </section>
        )}

        {queryEnabled && searchQuery.isSuccess && results.length === 0 && (
          <section className="rounded-lg border border-border bg-white p-8 text-center shadow-sm shadow-slate-200/70">
            <p className="font-semibold text-ink-primary">
              No matching results
            </p>
            <p className="mt-2 text-sm text-ink-secondary">
              Try another description or choose a different reference image.
            </p>
          </section>
        )}

        {queryEnabled && results.length > 0 && (
          <>
            <ResultGrid
              results={results}
              isBookmarked={isBookmarked}
              onBookmark={(result) => toggleBookmark(result.id)}
              onSelectResult={setSelectedResult}
            />

            {searchQuery.isFetchingNextPage && <ResultGridSkeleton limit={8} />}

            {searchQuery.isFetchNextPageError && (
              <div className="flex flex-col items-center gap-3 border-t border-border pt-6 text-center">
                <p className="text-sm font-semibold text-red-700">
                  Unable to load more results.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void searchQuery.fetchNextPage()}
                >
                  Try again
                </Button>
              </div>
            )}

            <div
              ref={loadMoreRef}
              className="flex min-h-16 items-center justify-center border-t border-border pt-6 text-sm font-semibold text-ink-muted"
            >
              {searchQuery.hasNextPage
                ? searchQuery.isFetchingNextPage
                  ? "Loading more images..."
                  : "Scroll to load more"
                : `All ${results.length} results loaded`}
            </div>
          </>
        )}
      </PageContainer>

      {selectedResult && (
        <SearchResultDetailModal
          result={selectedResult}
          isBookmarked={isBookmarked(selectedResult.id)}
          onClose={() => setSelectedResult(null)}
          onBookmark={(result) => toggleBookmark(result.id)}
          onFindSimilar={handleFindSimilarResult}
        />
      )}
    </div>
  );

  function handleFindSimilarResult(result: SearchResult) {
    const nextParams = new URLSearchParams();
    nextParams.set("mode", "image");
    nextParams.set("imageId", String(result.id));
    nextParams.set("limit", String(pageLimit));

    setSelectedResult(null);
    setSearchParams(nextParams, { state: null });
  }
}

function parseSearchMode(value: string | null): SearchMode {
  if (value === "image" || value === "semantic" || value === "ocr") {
    return value;
  }

  return "semantic";
}

function getResultTitle(
  mode: SearchMode,
  query: string,
  fileName?: string,
  imageId?: number,
) {
  if (mode === "image") {
    if (imageId) {
      return `Images similar to #${imageId}`;
    }

    return fileName ? `Results for ${fileName}` : "Image search results";
  }

  return query ? `Results for “${query}”` : "Search results";
}

function parseOptionalPositiveNumber(value: string | null) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function runSearch({
  mode,
  query,
  imageId,
  page,
  limit,
  file,
}: {
  mode: SearchMode;
  query: string;
  imageId?: number;
  page: number;
  limit: number;
  file?: File;
}): Promise<SearchResponse> {
  if (mode === "image") {
    return searchByImage({ file, imageId, page, limit });
  }

  return searchByText({
    q: query,
    mode,
    page,
    limit,
  });
}

function ResultGridSkeleton({ limit }: { limit: number }) {
  return (
    <div className="columns-1 gap-5 sm:columns-2 lg:columns-3 xl:columns-4">
      {Array.from({ length: limit }).map((_, index) => (
        <div
          key={index}
          className="mb-5 break-inside-avoid rounded-lg bg-white p-2 shadow-sm"
        >
          <Skeleton
            height={index % 3 === 0 ? 260 : 190}
            className="overflow-hidden rounded-md"
          />
          <Skeleton lines={1} className="mt-3" />
        </div>
      ))}
    </div>
  );
}
