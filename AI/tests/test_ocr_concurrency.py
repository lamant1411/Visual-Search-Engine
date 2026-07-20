import os
import sys
import unittest
from pathlib import Path
from threading import Barrier, Lock, Thread
from time import sleep
from unittest.mock import patch

import numpy as np


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import ocr_module


class _ConcurrentReader:
    def __init__(self, fail_when_concurrent=False):
        self._lock = Lock()
        self.active = 0
        self.max_active = 0
        self.fail_when_concurrent = fail_when_concurrent

    def readtext(self, _image, **_kwargs):
        with self._lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
            should_fail = self.fail_when_concurrent and self.active > 1
        try:
            if should_fail:
                raise RuntimeError("simulated concurrent inference failure")
            sleep(0.03)
            return [(None, "same text", 0.99)]
        finally:
            with self._lock:
                self.active -= 1


class OcrConcurrencyTests(unittest.TestCase):
    def _build_extractor(self, reader):
        with patch.dict(os.environ, {"OCR_MAX_CONCURRENT_INFERENCE": "2"}), patch.object(
            ocr_module.easyocr,
            "Reader",
            return_value=reader,
        ), patch("builtins.print"):
            return ocr_module.OCRExtractor()

    def test_allows_two_calls_without_changing_results(self):
        reader = _ConcurrentReader()
        extractor = self._build_extractor(reader)
        barrier = Barrier(5)
        results = [None] * 4
        image = np.zeros((16, 16, 3), dtype=np.uint8)

        def extract(index):
            barrier.wait()
            results[index] = extractor.extract_text(image)

        threads = [Thread(target=extract, args=(index,)) for index in range(4)]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join(timeout=2)

        self.assertEqual(reader.max_active, 2)
        self.assertEqual(results, [["same text"]] * 4)
        self.assertFalse(extractor._force_serial)

    def test_runtime_failure_retries_and_forces_serial_mode(self):
        reader = _ConcurrentReader(fail_when_concurrent=True)
        extractor = self._build_extractor(reader)
        barrier = Barrier(3)
        results = [None] * 2
        image = np.zeros((16, 16, 3), dtype=np.uint8)

        def extract(index):
            barrier.wait()
            results[index] = extractor.extract_text(image)

        threads = [Thread(target=extract, args=(index,)) for index in range(2)]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join(timeout=2)

        self.assertEqual(results, [["same text"]] * 2)
        self.assertTrue(extractor._force_serial)

        extractor.extract_text(image)
        self.assertTrue(extractor._force_serial)


if __name__ == "__main__":
    unittest.main()
