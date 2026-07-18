import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import item_indexing


class FakeClip:
    def embed_image(self, image):
        return [0.1] * item_indexing.EMBEDDING_DIM


class FakeOCR:
    def extract_text(self, image):
        return ["Sale 50%", "Nike"]


class ItemIndexingTests(unittest.TestCase):
    @patch("item_indexing._persist_index_success")
    @patch("item_indexing._get_qdrant_client")
    def test_index_single_image_success(self, get_qdrant, persist_success):
        qdrant = MagicMock()
        get_qdrant.return_value = qdrant

        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "test.jpg"
            Image.new("RGB", (100, 80), color="red").save(image_path)

            item = {
                "item_id": 1,
                "batch_id": "idx_test",
                "image_id": 10,
                "image_path": str(image_path),
                "storage_path": "/static/images/test.jpg",
                "original_filename": "test.jpg",
            }

            item_indexing.index_single_image_item(
                item,
                FakeClip(),
                FakeOCR(),
            )

        qdrant.upsert.assert_called_once()
        persist_success.assert_called_once()

        saved = persist_success.call_args.kwargs
        self.assertEqual(saved["width"], 100)
        self.assertEqual(saved["height"], 80)
        self.assertEqual(saved["ocr_text"], "Sale 50% Nike")

    def test_missing_image(self):
        item = {
            "item_id": 1,
            "batch_id": "idx_test",
            "image_id": 10,
            "image_path": "missing.jpg",
            "storage_path": "/static/images/missing.jpg",
        }

        with self.assertRaises(FileNotFoundError):
            item_indexing.index_single_image_item(
                item,
                FakeClip(),
                FakeOCR(),
            )


if __name__ == "__main__":
    unittest.main()