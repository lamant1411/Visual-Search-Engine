import { useState } from "react";
import { Bookmark, ImageOff, Info, Zap } from "lucide-react";

import type { SearchResult } from "../types";
import { formatSimilarityScore } from "../utils/formatSimilarityScore";

type ResultCardProps = {
  result: SearchResult;
  priority?: boolean;
  isBookmarked?: boolean;
  showSimilarity?: boolean;
  onBookmark?: (result: SearchResult) => void;
  onSelect?: (result: SearchResult) => void;
};

export function ResultCard({
  result,
  priority = false,
  isBookmarked = false,
  showSimilarity = true,
  onBookmark,
  onSelect,
}: ResultCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const sizeLabel =
    result.metadata.width && result.metadata.height
      ? `${result.metadata.width} x ${result.metadata.height}`
      : "Unknown size";
  const aspectRatio =
    result.metadata.width && result.metadata.height
      ? `${result.metadata.width} / ${result.metadata.height}`
      : "4 / 3";
  const similarityScore = formatSimilarityScore(result.similarityScore);

  return (
    <article className="group relative mb-5 block w-full break-inside-avoid overflow-hidden rounded-lg bg-white text-left shadow-sm shadow-slate-200/70 ring-1 ring-white/70 transition duration-200 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-slate-200/90">
      <button
        type="button"
        className="block w-full cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-600"
        aria-label={`Open detail for image ${result.id}`}
        onClick={() => onSelect?.(result)}
      >
        <div
          className="relative overflow-hidden bg-surface-1"
          style={{ aspectRatio }}
        >
          {!imageLoaded && !imageFailed && (
            <div className="absolute inset-0 animate-pulse bg-slate-200" />
          )}
          {imageFailed ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-100 px-4 text-center text-slate-500">
              <ImageOff className="h-7 w-7" aria-hidden="true" />
              <span className="text-xs font-semibold">Image unavailable</span>
            </div>
          ) : (
            <img
              alt={`Search result ${result.id}`}
              className={[
                "h-full w-full object-cover transition duration-300 group-hover:scale-105",
                imageLoaded ? "opacity-100" : "opacity-0",
              ].join(" ")}
              decoding="async"
              fetchPriority={priority ? "high" : "auto"}
              loading={priority ? "eager" : "lazy"}
              src={result.thumbnailUrl}
              onLoad={() => setImageLoaded(true)}
              onError={() => {
                setImageLoaded(false);
                setImageFailed(true);
              }}
            />
          )}
          {showSimilarity && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-1 rounded-full bg-white/95 px-2.5 py-1 text-xs font-bold text-ink-primary shadow-sm shadow-slate-900/10 backdrop-blur">
              <Zap className="h-3.5 w-3.5 text-accent-600" />
              {similarityScore}%
            </span>
          )}

          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent p-4 pt-14 text-white opacity-0 transition duration-200 group-hover:opacity-100 group-focus-visible:opacity-100">
            <h2 className="text-sm font-semibold">
              {result.metadata.source ?? "Image result"}
            </h2>
            <p className="mt-1 text-xs text-white/80">
              {sizeLabel}
              {` · #${result.id}`}
            </p>

            {result.metadata.ocrText && (
              <p className="mt-3 inline-flex max-w-full items-center gap-2 rounded-md bg-white/90 px-3 py-2 text-xs font-semibold text-slate-800">
                <Info className="h-3.5 w-3.5 shrink-0" />
                <span className="truncate">OCR: {result.metadata.ocrText}</span>
              </p>
            )}
          </div>
        </div>
      </button>

      <button
        type="button"
        aria-label={
          isBookmarked
            ? `Remove image ${result.id} from bookmarks`
            : `Bookmark image ${result.id}`
        }
        aria-pressed={isBookmarked}
        title={isBookmarked ? "Remove bookmark" : "Save to bookmarks"}
        className="absolute right-3 top-3 z-10 inline-flex h-10 w-10 cursor-pointer items-center justify-center rounded-lg border border-transparent bg-transparent text-white opacity-100 drop-shadow-[0_1px_2px_rgba(15,23,42,0.9)] transition duration-200 hover:-translate-y-0.5 hover:border-white/15 hover:bg-slate-950/55 hover:drop-shadow-none focus-visible:-translate-y-0.5 focus-visible:border-white/20 focus-visible:bg-slate-950/60 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/90 md:translate-y-1 md:opacity-0 md:group-hover:translate-y-0 md:group-hover:opacity-100 md:group-focus-within:translate-y-0 md:group-focus-within:opacity-100"
        onClick={() => onBookmark?.(result)}
      >
        <Bookmark
          className={isBookmarked ? "h-5 w-5 fill-white" : "h-5 w-5"}
          strokeWidth={2.25}
        />
      </button>
    </article>
  );
}
