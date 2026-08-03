import hashlib
import os
from dataclasses import dataclass
from queue import LifoQueue
from threading import BoundedSemaphore, Lock
from time import perf_counter
from typing import Optional, Tuple

import cpu_runtime

cpu_runtime.apply_thread_environment(cpu_runtime.CPU_SETTINGS)

import easyocr
import numpy as np
from PIL import Image, ImageDraw, ImageFont

try:
    import onnxruntime
    import rapidocr as rapidocr_package
    from rapidocr import RapidOCR
except ImportError:  # Keeps the EasyOCR-only rollback mode usable.
    onnxruntime = None
    rapidocr_package = None
    RapidOCR = None


@dataclass(frozen=True)
class OCRExtractionResult:
    texts: Tuple[str, ...]
    scores: Tuple[float, ...]
    detected_count: int
    failed: bool = False
    error: Optional[str] = None

    @property
    def mean_confidence(self) -> float:
        if not self.scores:
            return 0.0
        return sum(self.scores) / len(self.scores)


class OCRExtractor:
    """Existing EasyOCR implementation, retained as fallback and rollback mode."""

    engine_name = "easyocr"

    def __init__(self, langs=None, use_gpu=None):
        langs = langs or ["en", "vi"]
        if use_gpu is None:
            use_gpu = os.getenv("OCR_USE_GPU", "false").lower() == "true"

        self.recognition_batch_size = int(os.getenv("OCR_RECOGNITION_BATCH_SIZE", "1"))
        self.canvas_size = int(os.getenv("OCR_CANVAS_SIZE", "896"))
        self.min_size = int(os.getenv("OCR_MIN_SIZE", "25"))
        self.text_threshold = float(os.getenv("OCR_TEXT_THRESHOLD", "0.75"))
        self.low_text = float(os.getenv("OCR_LOW_TEXT", "0.45"))
        self.confidence_threshold = float(os.getenv("OCR_CONFIDENCE_THRESHOLD", "0.3"))
        self.max_input_dimension = int(os.getenv("OCR_MAX_INPUT_DIMENSION", "1600"))
        default_concurrency = max(
            1,
            min(
                2,
                cpu_runtime.CPU_SETTINGS.cpu_budget
                // max(1, cpu_runtime.CPU_SETTINGS.torch_threads),
            ),
        )
        self.max_concurrent_inference = max(
            1,
            int(os.getenv("OCR_MAX_CONCURRENT_INFERENCE", str(default_concurrency))),
        )
        easyocr_version = getattr(easyocr, "__version__", "unknown")
        self.cache_signature = (
            f"easyocr-{easyocr_version};langs={','.join(langs)};"
            f"canvas={self.canvas_size};min={self.min_size};"
            f"text={self.text_threshold:g};low={self.low_text:g};"
            f"confidence={self.confidence_threshold:g};maxdim={self.max_input_dimension}"
        )
        self._inference_slots = BoundedSemaphore(self.max_concurrent_inference)
        self._serial_fallback_lock = Lock()
        self._state_lock = Lock()
        self._force_serial = False
        print(f"Loading EasyOCR languages={langs}...")
        self.reader = easyocr.Reader(langs, gpu=use_gpu)
        print(
            "EasyOCR ready: "
            f"concurrency={self.max_concurrent_inference}",
            flush=True,
        )

    def extract_text(self, image_input) -> list:
        try:
            image_input = self._prepare_image(image_input)
            results = self._readtext(image_input)
            return [
                text.strip()
                for _, text, confidence in results
                if confidence >= self.confidence_threshold and text.strip()
            ]
        except Exception as exc:
            print(f"EasyOCR extraction failed: {exc}", flush=True)
            return []

    def warm_up(self) -> float:
        started_at = perf_counter()
        self.extract_text(_warmup_image())
        return perf_counter() - started_at

    def _prepare_image(self, image_input):
        if isinstance(image_input, str):
            if not os.path.exists(image_input):
                raise FileNotFoundError(f"Image not found: {image_input}")
            valid_extensions = (".jpg", ".jpeg", ".png", ".webp")
            if not image_input.lower().endswith(valid_extensions):
                raise ValueError(f"Unsupported image format. Expected: {valid_extensions}")
            return image_input

        if isinstance(image_input, Image.Image):
            prepared_image = image_input.convert("RGB")
            if max(prepared_image.size) > self.max_input_dimension:
                prepared_image.thumbnail(
                    (self.max_input_dimension, self.max_input_dimension),
                    Image.Resampling.LANCZOS,
                )
            rgb_image = np.asarray(prepared_image)
            return np.ascontiguousarray(rgb_image[:, :, ::-1])

        return image_input

    def _readtext(self, image_input):
        with self._state_lock:
            force_serial = self._force_serial

        if force_serial:
            return self._readtext_serial(image_input)

        try:
            with self._inference_slots:
                return self._call_reader(image_input)
        except RuntimeError as exc:
            if self.max_concurrent_inference <= 1:
                raise
            with self._state_lock:
                self._force_serial = True
            print(
                "[OCR] Concurrent EasyOCR inference failed; switching to serial mode: "
                f"{exc}",
                flush=True,
            )
            return self._readtext_serial(image_input)

    def _readtext_serial(self, image_input):
        with self._serial_fallback_lock:
            for _ in range(self.max_concurrent_inference):
                self._inference_slots.acquire()
            try:
                return self._call_reader(image_input)
            finally:
                for _ in range(self.max_concurrent_inference):
                    self._inference_slots.release()

    def _call_reader(self, image_input):
        return self.reader.readtext(
            image_input,
            detail=1,
            batch_size=self.recognition_batch_size,
            canvas_size=self.canvas_size,
            min_size=self.min_size,
            text_threshold=self.text_threshold,
            low_text=self.low_text,
            workers=0,
        )


class RapidOCRExtractor:
    """CPU-oriented PP-OCRv6 Small implementation backed by ONNX Runtime."""

    engine_name = "rapidocr"

    def __init__(self):
        if RapidOCR is None or rapidocr_package is None or onnxruntime is None:
            raise RuntimeError(
                "RapidOCR mode requires the 'rapidocr' and 'onnxruntime' packages."
            )

        self.confidence_threshold = float(
            os.getenv("RAPID_OCR_CONFIDENCE_THRESHOLD", "0.45")
        )
        self.max_input_dimension = int(
            os.getenv("RAPID_OCR_MAX_INPUT_DIMENSION", "1600")
        )
        self.use_cls = os.getenv("RAPID_OCR_USE_CLS", "true").lower() == "true"
        self.max_concurrent_inference = max(
            1,
            int(os.getenv("RAPID_OCR_MAX_CONCURRENT_INFERENCE", "1")),
        )
        rapid_version = getattr(rapidocr_package, "__version__", "unknown")
        ort_version = getattr(onnxruntime, "__version__", "unknown")
        self.cache_signature = (
            f"rapidocr-{rapid_version};ort={ort_version};model=ppocrv6-small;"
            f"confidence={self.confidence_threshold:g};"
            f"maxdim={self.max_input_dimension};cls={int(self.use_cls)}"
        )

        # A dedicated engine per slot avoids sharing mutable pipeline state
        # between worker threads. One slot lets ONNX Runtime use the CPU cores
        # efficiently without two sessions oversubscribing the same machine.
        self._engines = []
        self._engine_pool = LifoQueue(maxsize=self.max_concurrent_inference)
        raw_text_score = min(self.confidence_threshold, 0.30)
        for _ in range(self.max_concurrent_inference):
            engine = RapidOCR(params={"Global.text_score": raw_text_score})
            self._engines.append(engine)
            self._engine_pool.put(engine)

        print(
            "RapidOCR ready: model=PP-OCRv6-small backend=onnxruntime "
            f"concurrency={self.max_concurrent_inference} cls={self.use_cls}",
            flush=True,
        )

    def extract_text(self, image_input) -> list:
        return list(self.extract_result(image_input).texts)

    def extract_result(self, image_input) -> OCRExtractionResult:
        try:
            prepared_image = self._prepare_image(image_input)
            engine = self._engine_pool.get()
            try:
                output = engine(prepared_image, use_cls=self.use_cls)
            finally:
                self._engine_pool.put(engine)

            raw_texts = tuple(str(text).strip() for text in (output.txts or ()))
            raw_scores = tuple(float(score) for score in (output.scores or ()))
            detected_count = len(output.boxes) if output.boxes is not None else len(raw_texts)
            accepted = [
                (text, score)
                for text, score in zip(raw_texts, raw_scores)
                if text and score >= self.confidence_threshold
            ]
            return OCRExtractionResult(
                texts=tuple(text for text, _ in accepted),
                scores=raw_scores,
                detected_count=detected_count,
            )
        except Exception as exc:
            return OCRExtractionResult(
                texts=(),
                scores=(),
                detected_count=0,
                failed=True,
                error=str(exc),
            )

    def warm_up(self) -> float:
        started_at = perf_counter()
        image = self._prepare_image(_warmup_image())
        for engine in self._engines:
            engine(image, use_cls=self.use_cls)
        return perf_counter() - started_at

    def _prepare_image(self, image_input):
        if isinstance(image_input, str):
            if not os.path.exists(image_input):
                raise FileNotFoundError(f"Image not found: {image_input}")
            with Image.open(image_input) as source_image:
                image_input = source_image.convert("RGB")

        if isinstance(image_input, Image.Image):
            prepared_image = image_input.convert("RGB")
            if max(prepared_image.size) > self.max_input_dimension:
                prepared_image.thumbnail(
                    (self.max_input_dimension, self.max_input_dimension),
                    Image.Resampling.LANCZOS,
                )
            rgb_image = np.asarray(prepared_image)
            return np.ascontiguousarray(rgb_image[:, :, ::-1])

        return image_input


class HybridOCRExtractor:
    """Fast RapidOCR primary with EasyOCR only for uncertain detections."""

    engine_name = "hybrid-rapidocr-easyocr"

    def __init__(self, primary=None, fallback=None):
        self.primary = primary or RapidOCRExtractor()
        self.fallback = fallback or OCRExtractor()
        self.fallback_confidence_threshold = float(
            os.getenv("OCR_FALLBACK_CONFIDENCE_THRESHOLD", "0.55")
        )
        self.max_concurrent_inference = self.primary.max_concurrent_inference
        self.max_input_dimension = self.primary.max_input_dimension
        fallback_fingerprint = hashlib.sha256(
            self.fallback.cache_signature.encode("utf-8")
        ).hexdigest()[:12]
        self.cache_signature = (
            f"hybrid;primary={self.primary.cache_signature};"
            f"fallback={fallback_fingerprint};"
            f"fallback_confidence={self.fallback_confidence_threshold:g}"
        )

    def extract_text(self, image_input) -> list:
        result = self.primary.extract_result(image_input)
        fallback_reason = self._fallback_reason(result)
        if fallback_reason is None:
            return list(result.texts)

        print(
            f"[OCR] RapidOCR -> EasyOCR fallback reason={fallback_reason}",
            flush=True,
        )
        return self.fallback.extract_text(image_input)

    def warm_up(self) -> float:
        return self.primary.warm_up() + self.fallback.warm_up()

    def _fallback_reason(self, result: OCRExtractionResult) -> Optional[str]:
        if result.failed:
            return f"primary-error:{result.error or 'unknown'}"
        # No detected region normally means a photo without searchable text.
        # Running EasyOCR here would erase most of the speed advantage.
        if result.detected_count == 0:
            return None
        if not result.texts:
            return "detected-text-without-confident-recognition"
        if result.mean_confidence < self.fallback_confidence_threshold:
            return f"mean-confidence:{result.mean_confidence:.3f}"
        return None


def create_ocr_extractor():
    """Create the configured OCR engine without changing callers or stored rows."""
    engine = os.getenv("OCR_ENGINE", "easyocr").strip().lower()
    if engine == "easyocr":
        return OCRExtractor()
    if engine in {"rapidocr", "rapid"}:
        return RapidOCRExtractor()
    if engine in {"hybrid", "rapidocr+easyocr"}:
        return HybridOCRExtractor()
    raise ValueError(
        f"Unsupported OCR_ENGINE={engine!r}. Expected easyocr, rapidocr, or hybrid."
    )


def _warmup_image() -> Image.Image:
    image = Image.new("RGB", (896, 512), color="white")
    draw = ImageDraw.Draw(image)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 48)
    except OSError:
        font = ImageFont.load_default()
    draw.text((40, 180), "WARMUP 123 VISUAL SEARCH", fill="black", font=font)
    return image
