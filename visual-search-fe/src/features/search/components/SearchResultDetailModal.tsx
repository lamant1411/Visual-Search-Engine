import {
  type MouseEvent,
  type PointerEvent,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  useState,
} from "react";
import {
  AlertCircle,
  Bookmark,
  Check,
  Copy,
  Crop,
  Info,
  Loader2,
  Minus,
  Plus,
  RotateCcw,
  X,
  Zap,
} from "lucide-react";

import { Button } from "@/components/base/button";
import { useDialogAccessibility } from "@/lib/ui/useDialogAccessibility";

import type { SearchResult } from "../types";
import { formatSimilarityScore } from "../utils/formatSimilarityScore";
import { ImageCropModal } from "./ImageCropModal";

type SearchResultDetailModalProps = {
  result: SearchResult;
  isBookmarked?: boolean;
  onBookmark?: (result: SearchResult) => void;
  onClose: () => void;
  onFindSimilar?: (result: SearchResult, croppedFile?: File) => void | Promise<void>;
  showSimilarity?: boolean;
  footerAction?: ReactNode;
};

export function SearchResultDetailModal({
  result,
  isBookmarked = false,
  onBookmark,
  onClose,
  onFindSimilar,
  showSimilarity = true,
  footerAction,
}: SearchResultDetailModalProps) {
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "error">(
    "idle",
  );
  const [imageLoaded, setImageLoaded] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [zoomOrigin, setZoomOrigin] = useState("50% 50%");
  const [dragStartY, setDragStartY] = useState<number | null>(null);
  const [isOcrExpanded, setIsOcrExpanded] = useState(false);
  const [cropSourceFile, setCropSourceFile] = useState<File | null>(null);
  const [cropError, setCropError] = useState<string>();
  const [isPreparingCrop, setIsPreparingCrop] = useState(false);
  const prepareCropRequestRef = useRef<AbortController | null>(null);
  const isZoomed = zoom > 1;
  const similarityScore = formatSimilarityScore(result.similarityScore);
  const sizeLabel =
    result.metadata.width && result.metadata.height
      ? `${result.metadata.width} x ${result.metadata.height}`
      : "Unknown size";
  const cropSourceUrl = useMemo(
    () => (cropSourceFile ? URL.createObjectURL(cropSourceFile) : null),
    [cropSourceFile],
  );
  const dialogRef = useDialogAccessibility<HTMLElement>(onClose, {
    enabled: !cropSourceFile,
  });

  useEffect(() => {
    return () => {
      prepareCropRequestRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    return () => {
      if (cropSourceUrl) {
        URL.revokeObjectURL(cropSourceUrl);
      }
    };
  }, [cropSourceUrl]);

  if (cropSourceFile && cropSourceUrl && onFindSimilar) {
    return (
      <ImageCropModal
        file={cropSourceFile}
        imageUrl={cropSourceUrl}
        onCancel={() => setCropSourceFile(null)}
        onConfirm={(croppedFile) => onFindSimilar(result, croppedFile)}
        onUseOriginal={() => onFindSimilar(result)}
      />
    );
  }

  return (
    <div
      aria-labelledby="search-result-detail-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
      role="dialog"
      onClick={onClose}
    >
      <section
        ref={dialogRef}
        className="flex max-h-[96vh] w-[96vw] max-w-[1500px] flex-col overflow-y-auto rounded-lg bg-white shadow-2xl lg:grid lg:h-[92vh] lg:grid-cols-[minmax(0,1fr)_340px] lg:overflow-hidden"
        tabIndex={-1}
        onClick={(event) => event.stopPropagation()}
      >
        <button
          aria-label="Swipe down to close image detail"
          className="flex min-h-9 items-center justify-center bg-white lg:hidden"
          type="button"
          onPointerDown={(event) => setDragStartY(event.clientY)}
          onPointerUp={(event) => {
            if (dragStartY !== null && event.clientY - dragStartY > 70) {
              onClose();
            }
            setDragStartY(null);
          }}
          onPointerCancel={() => setDragStartY(null)}
        >
          <span className="h-1.5 w-12 rounded-full bg-slate-300" />
        </button>

        <div
          className={[
            "relative flex h-[45vh] min-h-[280px] shrink-0 items-center justify-center overflow-hidden bg-slate-950 sm:min-h-[360px] lg:h-auto lg:min-h-0",
            isZoomed ? "cursor-zoom-out" : "cursor-zoom-in",
            isZoomed ? "touch-none" : "touch-pan-y",
          ].join(" ")}
          onClick={handleImageClick}
          onPointerMove={handleImagePointerMove}
        >
          <div
            className="absolute left-4 top-4 z-10 flex items-center gap-2 rounded-full bg-black/60 p-1 text-white shadow-sm backdrop-blur"
            onClick={(event) => event.stopPropagation()}
          >
            <button
              aria-label="Zoom out"
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
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
              className="inline-flex h-11 cursor-pointer items-center justify-center gap-1 rounded-full px-3 text-xs font-bold transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 sm:h-9"
              type="button"
              onClick={resetZoom}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              {Math.round(zoom * 100)}%
            </button>

            <button
              aria-label="Zoom in"
              className="inline-flex h-11 w-11 cursor-pointer items-center justify-center rounded-full transition hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 disabled:cursor-not-allowed disabled:opacity-40 sm:h-9 sm:w-9"
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
              <h2 id="search-result-detail-title" className="font-display mt-1 text-2xl font-bold text-ink-primary">
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

          {result.metadata.status === 'failed' && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-red-700">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                Lỗi Index AI
              </div>
              <p className="mt-1 text-xs text-red-600">
                Ảnh này vừa được tải lên nhưng gặp lỗi trong quá trình trích xuất vector hoặc OCR. Ảnh đã được lưu an toàn trong thư viện nhưng chưa thể tìm kiếm bằng AI.
              </p>
            </div>
          )}

          {result.metadata.status === 'pending' && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-amber-700">
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-amber-600" />
                Đang tiến hành Indexing
              </div>
              <p className="mt-1 text-xs text-amber-600">
                Ảnh đã tải lên thành công và đang được xử lý ở nền. Ảnh sẽ tự động sẵn sàng cho tìm kiếm sau khi hoàn tất.
              </p>
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
                Text found in image
              </div>
              <p
                className={[
                  "mt-2 text-sm text-ink-secondary",
                  isOcrExpanded ? "" : "line-clamp-4",
                ].join(" ")}
              >
                {result.metadata.ocrText}
              </p>
              {result.metadata.ocrText.length > 180 && (
                <button
                  type="button"
                  className="mt-2 min-h-9 text-xs font-bold text-accent-700"
                  onClick={() => setIsOcrExpanded((current) => !current)}
                >
                  {isOcrExpanded ? "Show less" : "Show all detected text"}
                </button>
              )}
            </div>
          )}

          <div className="sticky bottom-0 -mx-5 mt-auto space-y-3 border-t border-border bg-white/95 px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 backdrop-blur lg:static lg:mx-0 lg:border-t-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:pt-6 lg:backdrop-blur-none">
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
              <>
                <Button
                  fullWidth
                  className="!bg-ink-primary shadow-sm shadow-slate-300/70 hover:!bg-slate-800 active:!bg-slate-900 focus-visible:ring-accent-600"
                  leftIcon={<Crop className="h-4 w-4" />}
                  loading={isPreparingCrop}
                  type="button"
                  onClick={handlePrepareCrop}
                >
                  {isPreparingCrop ? "Preparing image..." : "Choose area and find similar"}
                </Button>

                {cropError && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 p-3" role="alert">
                    <p className="text-xs font-semibold text-amber-900">{cropError}</p>
                    <button
                      className="mt-2 min-h-9 text-xs font-bold text-amber-950 underline underline-offset-4"
                      type="button"
                      onClick={() => onFindSimilar(result)}
                    >
                      Search using the full image instead
                    </button>
                  </div>
                )}
              </>
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

            {footerAction && (
              <div className="pt-1">
                {footerAction}
              </div>
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

  function handleImagePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (isZoomed) {
      updateZoomOrigin(event);
    }
  }

  function resetZoom() {
    setZoom(1);
    setZoomOrigin("50% 50%");
  }

  function updateZoomOrigin(event: MouseEvent<HTMLDivElement> | PointerEvent<HTMLDivElement>) {
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

  async function handlePrepareCrop() {
    if (!onFindSimilar || isPreparingCrop) {
      return;
    }

    prepareCropRequestRef.current?.abort();
    const controller = new AbortController();
    prepareCropRequestRef.current = controller;
    setCropError(undefined);
    setIsPreparingCrop(true);

    try {
      const file = await loadResultImageFile(result, controller.signal);
      setCropSourceFile(file);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        return;
      }

      setCropError(
        "This image cannot be opened in the crop tool. You can still search with the full image.",
      );
    } finally {
      if (prepareCropRequestRef.current === controller) {
        prepareCropRequestRef.current = null;
        setIsPreparingCrop(false);
      }
    }
  }
}

async function loadResultImageFile(result: SearchResult, signal: AbortSignal) {
  const response = await fetch(getCropFetchUrl(result.imageUrl), { signal });
  if (!response.ok) {
    throw new Error(`Unable to load image (${response.status}).`);
  }

  const blob = await response.blob();
  if (!blob.type.startsWith("image/")) {
    throw new Error("The selected resource is not an image.");
  }

  const extension = getImageExtension(blob.type);
  return new File([blob], `image-${result.id}.${extension}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

function getCropFetchUrl(imageUrl: string) {
  try {
    const parsedUrl = new URL(imageUrl, window.location.origin);
    if (parsedUrl.pathname.startsWith("/static/")) {
      return `${parsedUrl.pathname}${parsedUrl.search}`;
    }
  } catch {
    return imageUrl;
  }

  return imageUrl;
}

function getImageExtension(mimeType: string) {
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "jpg";
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
