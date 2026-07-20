import os
from threading import BoundedSemaphore, Lock

import cpu_runtime

cpu_runtime.apply_thread_environment(cpu_runtime.CPU_SETTINGS)

import easyocr
import numpy as np
from PIL import Image


class OCRExtractor:
    def __init__(self, langs=None, use_gpu=None):
        """
        Khởi tạo mô hình EasyOCR.
        """
        langs = langs or ['en', 'vi']
        if use_gpu is None:
            use_gpu = os.getenv("OCR_USE_GPU", "false").lower() == "true"

        self.recognition_batch_size = int(os.getenv("OCR_RECOGNITION_BATCH_SIZE", "1"))
        self.canvas_size = int(os.getenv("OCR_CANVAS_SIZE", "896"))
        self.min_size = int(os.getenv("OCR_MIN_SIZE", "25"))
        self.text_threshold = float(os.getenv("OCR_TEXT_THRESHOLD", "0.75"))
        self.low_text = float(os.getenv("OCR_LOW_TEXT", "0.45"))
        self.confidence_threshold = float(os.getenv("OCR_CONFIDENCE_THRESHOLD", "0.3"))
        self.max_input_dimension = int(os.getenv("OCR_MAX_INPUT_DIMENSION", "1600"))
        self.max_concurrent_inference = max(
            1,
            int(os.getenv("OCR_MAX_CONCURRENT_INFERENCE", "1")),
        )
        self._inference_slots = BoundedSemaphore(self.max_concurrent_inference)
        self._serial_fallback_lock = Lock()
        self._state_lock = Lock()
        self._force_serial = False
        print(f"Đang tải mô hình EasyOCR cho các ngôn ngữ: {langs}...")
        self.reader = easyocr.Reader(langs, gpu=use_gpu)
        print("Tải mô hình OCR thành công!\n")

    def extract_text(self, image_input) -> list:
        """
        Đọc ảnh và trích xuất các dòng chữ xuất hiện trong ảnh.
        Đầu vào: Đường dẫn ảnh (str) hoặc Mảng bytes (bytes).
        Đầu ra: Danh sách các chuỗi văn bản thuần túy (list[str]).
        """
        try:
            if isinstance(image_input, str):
                if not os.path.exists(image_input):
                    raise FileNotFoundError("Không tìm thấy ảnh tại đường dẫn đã cung cấp.")
                
                valid_extensions = ('.jpg', '.jpeg', '.png', '.webp')
                if not image_input.lower().endswith(valid_extensions):
                    raise ValueError(f"Định dạng không hợp lệ. Vui lòng dùng: {valid_extensions}")

            if isinstance(image_input, Image.Image):
                prepared_image = image_input.convert("RGB")
                if max(prepared_image.size) > self.max_input_dimension:
                    prepared_image.thumbnail(
                        (self.max_input_dimension, self.max_input_dimension),
                        Image.Resampling.LANCZOS,
                    )
                rgb_image = np.asarray(prepared_image)
                image_input = np.ascontiguousarray(rgb_image[:, :, ::-1])

            # Bounded concurrency improves throughput without changing OCR
            # inputs/model settings; runtime failures automatically force serial mode.
            results = self._readtext(image_input)
            return [
                text.strip()
                for _, text, confidence in results
                if confidence >= self.confidence_threshold and text.strip()
            ]
        
        except Exception as e:
            print(f"Lỗi khi trích xuất OCR: {e}")
            return []

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
                "[OCR] Concurrent inference failed; switching to serial mode: "
                f"{exc}",
                flush=True,
            )
            return self._readtext_serial(image_input)

    def _readtext_serial(self, image_input):
        # Acquire every permit so fallback cannot overlap an in-flight call.
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
