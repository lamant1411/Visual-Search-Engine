import unittest

from app.services.search import (
    _contains_diacritic,
    _normalize_ocr_query,
    _ocr_fuzzy_threshold,
    _ocr_token_pattern,
)


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

    def test_short_ocr_query_requires_a_complete_token(self):
        self.assertEqual(
            _ocr_token_pattern("cho"),
            r"(^|[[:space:]])cho([[:space:]]|$)",
        )

    def test_multiword_ocr_query_requires_a_complete_phrase(self):
        self.assertEqual(
            _ocr_token_pattern("summer sale"),
            r"(^|[[:space:]])summer[[:space:]]+sale([[:space:]]|$)",
        )

    def test_detects_vietnamese_diacritics_for_short_query_precision(self):
        self.assertTrue(_contains_diacritic("chó"))
        self.assertTrue(_contains_diacritic("đỏ"))
        self.assertFalse(_contains_diacritic("cho"))
        self.assertFalse(_contains_diacritic("dog"))


if __name__ == "__main__":
    unittest.main()
