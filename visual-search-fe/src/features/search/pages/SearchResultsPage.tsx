import { useEffect, useMemo, useRef, useState } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useLocation, useNavigate, useSearchParams } from "react-router";
import { ImageUp, RotateCcw } from "lucide-react";

import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/base/button";

import { ResultGrid, ResultGridSkeleton } from "../components/ResultGrid";
import { SearchResultDetailModal } from "../components/SearchResultDetailModal";
import { searchByImage, searchByText } from "../services/search.api";
import { useBookmarks } from "../hooks/useBookmarks";
import type { SearchMode, SearchResponse, SearchResult } from "../types";
import { getSearchErrorMessage } from "../utils/getSearchErrorMessage";
import { loadImageSearchFile } from "../utils/imageSearchSession";

type SearchLocationState = {
  file?: File;
  fileName?: string;
  historyKey?: string;
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
  const navigate = useNavigate();
  const state = (location.state ?? {}) as SearchLocationState;

  const mode = parseSearchMode(searchParams.get("mode"));
  const query = searchParams.get("q") ?? "";
  const imageId = parseOptionalPositiveNumber(searchParams.get("imageId"));
  const imageUrl = searchParams.get("imageUrl") ?? undefined;
  const historyKey = searchParams.get("historyKey") ?? state.historyKey;
  const [restoredImageFile, setRestoredImageFile] = useState<File | null>(null);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(
    null,
  );
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const { isBookmarked, toggleBookmark } = useBookmarks();
  const searchFile = state.file ?? restoredImageFile ?? undefined;
  const searchFileName = state.fileName ?? restoredImageFile?.name ?? query;
  const resultTitle = getResultTitle(mode, query, searchFileName, imageId);
  const referenceImageUrl =
    mode === "image"
      ? searchFile
        ? URL.createObjectURL(searchFile)
        : imageUrl ?? null
      : null;
  const shouldRevokeReferenceUrl = Boolean(searchFile && referenceImageUrl);
  const isMissingImageReference = mode === "image" && !searchFile && !imageId && !imageUrl;
  const queryEnabled =
    mode === "image" ? Boolean(searchFile || imageId || imageUrl) : query.trim().length > 0;
  const imageSearchKey = searchFile
    ? `${searchFile.name}-${searchFile.size}-${searchFile.lastModified}-${historyKey ?? "no-key"}`
    : imageUrl
      ? `url-${imageUrl}`
      : imageId
        ? `image-${imageId}`
        : "no-image";
  const searchQuery = useInfiniteQuery({
    queryKey: [
      "search-results",
      mode,
      query,
      imageId,
      imageUrl,
      historyKey,
      pageLimit,
      imageSearchKey,
    ],
    queryFn: ({ pageParam }) =>
      runSearch({
        mode,
        query,
        imageId,
        imageUrl,
        page: pageParam,
        limit: pageLimit,
        file: searchFile,
        historyKey,
      }),
    enabled: queryEnabled,
    initialPageParam: 1,
    retry: (failureCount, error) =>
      failureCount < 2 && getSearchErrorMessage(error).canRetry,
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
    if (mode !== "image" || state.file || restoredImageFile || imageId || !historyKey) {
      return;
    }

    let isActive = true;
    void loadImageSearchFile(historyKey).then((file) => {
      if (isActive) {
        setRestoredImageFile(file);
      }
    });

    return () => {
      isActive = false;
    };
  }, [historyKey, imageId, mode, restoredImageFile, state.file]);

  useEffect(() => {
    return () => {
      if (shouldRevokeReferenceUrl && referenceImageUrl) {
        URL.revokeObjectURL(referenceImageUrl);
      }
    };
  }, [referenceImageUrl, shouldRevokeReferenceUrl]);

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

          {referenceImageUrl && (
            <div className="mx-auto mt-6 flex w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-border bg-white text-left shadow-sm shadow-slate-200/70 sm:flex-row">
              <img
                src={referenceImageUrl}
                alt={`Reference image ${searchFileName ?? "uploaded image"}`}
                className="h-56 w-full bg-surface-1 object-contain sm:h-64 sm:w-[420px]"
              />
              <div className="flex min-w-0 flex-1 flex-col justify-center p-5">
                <p className="text-xs font-bold uppercase tracking-wide text-ink-muted">
                  Reference image
                </p>
                <p className="mt-2 break-words text-lg font-semibold leading-6 text-ink-primary">
                  {searchFileName ?? searchFile?.name}
                </p>
              </div>
            </div>
          )}
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
        ) : isMissingImageReference ? (
          <section className="rounded-lg border border-border bg-white p-8 text-center shadow-sm shadow-slate-200/70">
            <ImageUp className="mx-auto h-7 w-7 text-ink-muted" />
            <p className="mt-3 font-semibold text-ink-primary">
              Choose a reference image again
            </p>
            <p className="mx-auto mt-2 max-w-md text-sm text-ink-secondary">
              This history item no longer has a valid reference image.
              Choose a reference image again to search.
            </p>
            <Button
              className="mt-5"
              type="button"
              onClick={() => navigate("/search")}
            >
              Back to image search
            </Button>
          </section>
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
            <div className="mt-4 flex flex-wrap gap-3">
              {searchError.canRetry && (
                <Button
                  type="button"
                  variant="outline"
                  leftIcon={<RotateCcw className="h-4 w-4" />}
                  onClick={() => void searchQuery.refetch()}
                >
                  Try again
                </Button>
              )}
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/search")}
              >
                Start a new search
              </Button>
            </div>
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
  imageUrl?: string,
) {
  if (mode === "image") {
    if (imageId) {
      return `Images similar to #${imageId}`;
    }

    if (fileName) {
      return `Results for ${fileName}`;
    }

    if (imageUrl) {
      return query ? `Results for ${query}` : `Image search results`;
    }

    return "Image search results";
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
  imageUrl,
  page,
  limit,
  file,
  historyKey,
}: {
  mode: SearchMode;
  query: string;
  imageId?: number;
  imageUrl?: string;
  page: number;
  limit: number;
  file?: File;
  historyKey?: string;
}): Promise<SearchResponse> {
  if (mode === "image") {
    return searchByImage({ file, imageId, imageUrl, historyKey, page, limit });
  }

  return searchByText({
    q: query,
    mode,
    page,
    limit,
  });
}
