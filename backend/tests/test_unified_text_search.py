import unittest

from app.services.search import extract_explicit_ocr_query


class UnifiedTextSearchTests(unittest.TestCase):
    def test_extracts_vietnamese_ocr_intent(self) -> None:
        self.assertEqual(
            extract_explicit_ocr_query('Tôi muốn tìm ảnh có chữ “Nhím”'),
            "Nhím",
        )

    def test_extracts_english_ocr_intent(self) -> None:
        self.assertEqual(
            extract_explicit_ocr_query('find an image with text "Summer Sale"'),
            "Summer Sale",
        )

    def test_normal_description_is_not_forced_to_ocr(self) -> None:
        self.assertIsNone(extract_explicit_ocr_query("một chú chó ở ngoài trời"))

    def test_image_with_a_dog_is_semantic_not_ocr(self) -> None:
        self.assertIsNone(extract_explicit_ocr_query("hình ảnh có con chó"))

    def test_extracts_text_after_image_says_phrase(self) -> None:
        self.assertEqual(extract_explicit_ocr_query("ảnh ghi Nhím"), "Nhím")


if __name__ == "__main__":
    unittest.main()
