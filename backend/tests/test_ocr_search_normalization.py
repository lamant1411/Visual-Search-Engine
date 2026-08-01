import unittest

from app.services.search import _normalize_ocr_query, _ocr_fuzzy_threshold


class OCRSearchNormalizationTests(unittest.TestCase):
    def test_normalizes_vietnamese_but_does_not_modify_raw_text(self):
        raw_text = "Nhím - Giá: 50.000đ!"

        self.assertEqual(_normalize_ocr_query(raw_text), "nhim gia 50 000d")
        self.assertEqual(raw_text, "Nhím - Giá: 50.000đ!")

    def test_normalizes_uppercase_d_stroke(self):
        self.assertEqual(_normalize_ocr_query("ĐẠI HỌC"), "dai hoc")

    def test_uses_length_aware_fuzzy_thresholds(self):
        self.assertEqual(_normalize_ocr_query("Nhím"), "nhim")
        self.assertEqual(_ocr_fuzzy_threshold(4), 0.20)
        self.assertEqual(_ocr_fuzzy_threshold(7), 0.50)
        self.assertEqual(_ocr_fuzzy_threshold(12), 0.60)


if __name__ == "__main__":
    unittest.main()
