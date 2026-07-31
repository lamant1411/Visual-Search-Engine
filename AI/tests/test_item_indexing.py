import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import item_indexing


class FakeClip:
    def __init__(self):
        self.received_size = None

    def embed_image(self, image):
        self.received_size = image.size
        return [0.1] * item_indexing.EMBEDDING_DIM


class FakeOCR:
    max_input_dimension = 1600

    def __init__(self):
        self.received_size = None

    def extract_text(self, image):
        self.received_size = image.size
        return ["Sale 50%", "Nike"]


class ItemIndexingTests(unittest.TestCase):
    @patch("item_indexing._persist_semantic_success")
    @patch("item_indexing._get_qdrant_client")
    def test_semantic_stage_persists_without_waiting_for_ocr(self, get_qdrant, persist_success):
        qdrant = MagicMock()
        get_qdrant.return_value = qdrant
        clip = FakeClip()

        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "test.jpg"
            Image.new("RGB", (100, 80), color="red").save(image_path)
            item = self._item(image_path)
            item_indexing.index_semantic_image_item(item, clip)

        qdrant.upsert.assert_called_once()
        persist_success.assert_called_once()
        saved = persist_success.call_args.kwargs
        self.assertEqual(saved["width"], 100)
        self.assertEqual(saved["height"], 80)
        self.assertEqual(clip.received_size, (100, 80))

    @patch("item_indexing._persist_ocr_success")
    def test_ocr_stage_persists_text_independently(self, persist_success):
        ocr = FakeOCR()
        with tempfile.TemporaryDirectory() as temp_dir:
            image_path = Path(temp_dir) / "test.jpg"
            Image.new("RGB", (100, 80), color="red").save(image_path)
            item_indexing.index_ocr_image_item(self._item(image_path), ocr)

        persist_success.assert_called_once()
        self.assertEqual(persist_success.call_args.kwargs["ocr_text"], "Sale 50% Nike")
        self.assertEqual(ocr.received_size, (100, 80))

    def test_missing_image_fails_semantic_stage(self):
        with self.assertRaises(FileNotFoundError):
            item_indexing.index_semantic_image_item(self._item(Path("missing.jpg")), FakeClip())

    @staticmethod
    def _item(image_path: Path):
        return {
            "item_id": 1,
            "batch_id": "idx_test",
            "image_id": 10,
            "image_path": str(image_path),
            "storage_path": "/static/images/test.jpg",
            "original_filename": "test.jpg",
        }


if __name__ == "__main__":
    unittest.main()
