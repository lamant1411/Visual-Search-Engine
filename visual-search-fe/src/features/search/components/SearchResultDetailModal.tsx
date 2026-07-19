import { type MouseEvent, useEffect, useState } from "react";
import {
  Bookmark,
  Check,
  Copy,
  Info,
  Minus,
  Plus,
  RotateCcw,
  Search,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/base/button";

import type { SearchResult } from "../types";
import { formatSimilarityScore } from "../utils/formatSimilarityScore";

type SearchResultDetailModalProps = {
  result: SearchResult;
  isBookmarked?: boolean;
  onBookmark?: (result: SearchResult) => void;
  onClose: () => void;
  onFindSimilar?: (result: SearchResult) => void;
  showSimilarity?: boolean;
};

export function SearchResultDetailModal({
  result,
  isBookmarked = false,
  onBookmark,
  onClose,
  onFindSimilar,
  showSimilarity = true,
}: SearchResultDetailModalProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const isZoomed = zoom > 1;
  const similarityScore = formatSimilarityScore(result.similarityScore);
  const sizeLabel =
    result.metadata.width && result.metadata.height
      ? `${result.metadata.width} x ${result.metadata.height}`
      : "Unknown size";

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      onClick={onClose}
    >
      <section
        className="flex max-h-[96vh] w-[96vw] max-w-[1500px] flex-col overflow-y-auto rounded-lg bg-white shadow-2xl lg:grid lg:h-[92vh] lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden"
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={[
            "relative flex h-[45vh] min-h-[280px] shrink-0 items-center justify-center overflow-hidden bg-slate-950 sm:min-h-[360px] lg:h-auto lg:min-h-0",
            isZoomed ? "cursor-zoom-out" : "cursor-zoom-in",
          ].join(" ")}
          onClick={handleImageClick}
          onMouseMove={handleImageMouseMove}
        >
          <div
            className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-black/60 p-1 text-white shadow-sm backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Zoom out"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={zoom <= 1}
              type="button"
              onClick={() =>
                setZoom((currentZoom) => Math.max(1, currentZoom - 0.25))
              }
            >
              <Minus className="h-4 w-4" />
            </button>

            <button
              aria-label="Reset zoom"
              className="inline-flex h-9 cursor-pointer items-center justify-center gap-1 rounded-full px-3 text-xs font-bold transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              type="button"
              onClick={resetZoom}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {Math.round(zoom * 100)}%
            </button>

            <button
              aria-label="Zoom in"
              className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40"
              disabled={zoom >= 2.5}
              type="button"
              onClick={() =>
                setZoom((currentZoom) => Math.min(2.5, currentZoom + 0.25))
              }
            >
              <Plus className="h-4 w-4" />
            </button>
          </div>

          {!imageLoaded && (
            <div className="absolute inset-0 animate-pulse bg-slate-900" />
          )}

          <img
            alt={`Search result ${result.id}`}
            className={[
              "h-full w-full object-contain transition duration-200",
              imageLoaded ? "opacity-100" : "opacity-0",
            ].join(" ")}
            decoding="async"
            draggable={false}
            src={result.imageUrl}
            style={{ transform: `scale(${zoom})`, transformOrigin: zoomOrigin }}
            onLoad={() => setImageLoaded(true)}
          />
        </div>

        <aside className="flex flex-col bg-white p-5 lg:max-h-[92vh] lg:overflow-y-auto">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase text-accent-600">
                Image details
              </p>
              <h2 className="font-display mt-1 text-2xl font-bold text-ink-primary">
                Image #{result.id}
              </h2>
            </div>

            <Button
              aria-label="Close image detail"
              className="focus-visible:ring-accent-600"
              size="icon"
              type="button"
              variant="ghost"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>

          {showSimilarity && (
            <div className="mt-5 rounded-lg border border-border bg-surface-0 p-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-accent-600">
                <Zap className="h-4 w-4" />
                {similarityScore}% similarity
              </div>
            </div>
          )}

          <dl className="mt-5 space-y-4 text-sm">
            <DetailRow label="Dimensions" value={sizeLabel} />
            <DetailRow
              label="Source"
              value={result.metadata.source ?? "Unknown"}
            />
            <DetailRow label="Image ID" value={String(result.id)} />
          </dl>

          {result.metadata.ocrText && (
            <div className="mt-5 rounded-lg border border-border bg-white p-4 shadow-sm shadow-slate-200/70">
              <div className="flex items-center gap-2 text-sm font-semibold text-ink-primary">
                <Info className="h-4 w-4 text-accent-600" />
                OCR content
              </div>
              <p className="mt-2 text-sm text-ink-secondary">
                {result.metadata.ocrText}
              </p>
            </div>
          )}

          <div className="mt-auto space-y-3 pt-6">
            <Button
              fullWidth
              className="focus-visible:ring-accent-600"
              leftIcon={
                <Bookmark
                  className={isBookmarked ? "h-4 w-4 fill-current" : "h-4 w-4"}
                />
              }
              type="button"
              variant="outline"
              onClick={() => onBookmark?.(result)}
            >
              {isBookmarked ? "Remove bookmark" : "Save to bookmarks"}
            </Button>

            {onFindSimilar && (
              <Button
                fullWidth
                className="!bg-ink-primary shadow-sm shadow-slate-300/70 hover:!bg-slate-800 active:!bg-slate-900 focus-visible:ring-accent-600"
                leftIcon={<Search className="h-4 w-4" />}
                type="button"
                onClick={() => onFindSimilar(result)}
              >
                Find similar images
              </Button>
            )}

            <Button
              fullWidth
              className="focus-visible:ring-accent-600"
              leftIcon={
                copyStatus === "copied" ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )
              }
              type="button"
              variant="secondary"
              onClick={handleCopyImageUrl}
            >
              {copyStatus === "copied" ? "URL copied" : "Copy image URL"}
            </Button>

            {copyStatus === "error" && (
              <p className="text-center text-xs font-medium text-red-600">
                Unable to copy this URL.
              </p>
            )}
          </div>
        </aside>
      </section>
    </div>
  );

  function handleImageClick(event: MouseEvent<HTMLDivElement>) {
    updateZoomOrigin(event);
    setZoom((currentZoom) => (currentZoom > 1 ? 1 : 2));
  }

  function handleImageMouseMove(event: MouseEvent<HTMLDivElement>) {
    if (isZoomed) {
      updateZoomOrigin(event);
    }
  }

  function resetZoom() {
    setZoom(1);
    setZoomOrigin("50% 50%");
  }

  function updateZoomOrigin(event: MouseEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = clamp(
      ((event.clientX - bounds.left) / bounds.width) * 100,
      0,
      100,
    );
    const y = clamp(
      ((event.clientY - bounds.top) / bounds.height) * 100,
      0,
      100,
    );

    setZoomOrigin(`${x}% ${y}%`);
  }

  async function handleCopyImageUrl() {
    try {
      await navigator.clipboard.writeText(result.imageUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  }
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-white px-4 py-3 shadow-sm shadow-slate-200/60">
      <dt className="text-xs font-semibold uppercase text-ink-muted">
        {label}
      </dt>
      <dd className="mt-1 font-semibold text-ink-primary">{value}</dd>
    </div>
  );
}
