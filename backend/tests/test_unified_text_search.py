import unittest

from app.services.search import extract_explicit_ocr_query, should_prioritize_ocr


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

    def test_specific_exact_ocr_match_is_prioritized(self) -> None:
        self.assertTrue(
            should_prioritize_ocr(
                "Gustavo Verissimo Elickr con /photos gustty/",
                [100.0],
            )
        )

    def test_single_visual_subject_remains_semantic_first(self) -> None:
        self.assertFalse(should_prioritize_ocr("mosquito", [100.0]))

    def test_weak_ocr_match_does_not_override_semantic_search(self) -> None:
        self.assertFalse(should_prioritize_ocr("summer landscape", [75.0]))


if __name__ == "__main__":
    unittest.main()
