import os
import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import ocr_module


class _Primary:
    max_concurrent_inference = 1
    max_input_dimension = 1600
    cache_signature = "rapid-test"

    def __init__(self, result):
        self.result = result
        self.warmup_calls = 0

    def extract_result(self, _image):
        return self.result

    def warm_up(self):
        self.warmup_calls += 1
        return 0.1


class _Fallback:
    cache_signature = "easy-test"

    def __init__(self):
        self.calls = 0
        self.warmup_calls = 0

    def extract_text(self, _image):
        self.calls += 1
        return ["Easy fallback"]

    def warm_up(self):
        self.warmup_calls += 1
        return 0.2


class HybridOCRTests(unittest.TestCase):
    def _hybrid(self, result):
        fallback = _Fallback()
        with patch.dict(os.environ, {"OCR_FALLBACK_CONFIDENCE_THRESHOLD": "0.55"}):
            hybrid = ocr_module.HybridOCRExtractor(_Primary(result), fallback)
        return hybrid, fallback

    def test_confident_rapid_result_does_not_call_easyocr(self):
        result = ocr_module.OCRExtractionResult(
            texts=("Xin chao",),
            scores=(0.92,),
            detected_count=1,
        )
        hybrid, fallback = self._hybrid(result)

        self.assertEqual(hybrid.extract_text(object()), ["Xin chao"])
        self.assertEqual(fallback.calls, 0)

    def test_low_confidence_detection_calls_easyocr(self):
        result = ocr_module.OCRExtractionResult(
            texts=("uncertain",),
            scores=(0.40,),
            detected_count=1,
        )
        hybrid, fallback = self._hybrid(result)

        self.assertEqual(hybrid.extract_text(object()), ["Easy fallback"])
        self.assertEqual(fallback.calls, 1)

    def test_no_detected_text_does_not_call_easyocr(self):
        result = ocr_module.OCRExtractionResult(
            texts=(),
            scores=(),
            detected_count=0,
        )
        hybrid, fallback = self._hybrid(result)

        self.assertEqual(hybrid.extract_text(object()), [])
        self.assertEqual(fallback.calls, 0)

    def test_primary_error_calls_easyocr(self):
        result = ocr_module.OCRExtractionResult(
            texts=(),
            scores=(),
            detected_count=0,
            failed=True,
            error="boom",
        )
        hybrid, fallback = self._hybrid(result)

        self.assertEqual(hybrid.extract_text(object()), ["Easy fallback"])
        self.assertEqual(fallback.calls, 1)

    def test_factory_keeps_easyocr_rollback_mode(self):
        easy = MagicMock()
        with patch.dict(os.environ, {"OCR_ENGINE": "easyocr"}), patch.object(
            ocr_module,
            "OCRExtractor",
            return_value=easy,
        ):
            self.assertIs(ocr_module.create_ocr_extractor(), easy)


if __name__ == "__main__":
    unittest.main()
