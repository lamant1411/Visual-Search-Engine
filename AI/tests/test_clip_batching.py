import os
import sys
import unittest
from pathlib import Path
from threading import Barrier, Thread
from unittest.mock import MagicMock, patch

from PIL import Image
import torch


sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

import clip_module


class _FakeInputs(dict):
    def to(self, _device):
        return self


class ClipBatchingTests(unittest.TestCase):
    @patch.object(clip_module.CLIPProcessor, "from_pretrained")
    @patch.object(clip_module.CLIPModel, "from_pretrained")
    def test_concurrent_images_share_forward_pass_without_vector_mixup(
        self,
        load_model,
        load_processor,
    ):
        model = MagicMock()
        load_model.return_value.to.return_value = model

        processor = MagicMock()

        def prepare_inputs(*, images, return_tensors):
            self.assertEqual(return_tensors, "pt")
            red_values = [[image.getpixel((0, 0))[0]] for image in images]
            return _FakeInputs(pixel_values=torch.tensor(red_values, dtype=torch.float32))

        processor.side_effect = prepare_inputs
        load_processor.return_value = processor
        model.get_image_features.side_effect = (
            lambda pixel_values: pixel_values.repeat(1, 512)
        )

        with patch.dict(
            os.environ,
            {"CLIP_IMAGE_BATCH_SIZE": "2", "CLIP_IMAGE_BATCH_WAIT_MS": "100"},
        ), patch("builtins.print"):
            embedder = clip_module.CLIPEmbedder("fake-clip")

        barrier = Barrier(3)
        results = [None, None]
        images = [
            Image.new("RGB", (8, 8), color=(10, 0, 0)),
            Image.new("RGB", (8, 8), color=(20, 0, 0)),
        ]

        def embed(index):
            barrier.wait()
            results[index] = embedder.embed_image(images[index])

        threads = [Thread(target=embed, args=(0,)), Thread(target=embed, args=(1,))]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join(timeout=2)
        embedder._image_batcher.close()

        self.assertEqual(processor.call_count, 1)
        self.assertEqual(model.get_image_features.call_count, 1)
        self.assertEqual(len(results[0]), 512)
        self.assertEqual(len(results[1]), 512)
        self.assertEqual(results[0][0], 10.0)
        self.assertEqual(results[1][0], 20.0)

    @patch.object(clip_module.CLIPProcessor, "from_pretrained")
    @patch.object(clip_module.CLIPModel, "from_pretrained")
    def test_batch_memory_failure_falls_back_to_single_images(
        self,
        load_model,
        load_processor,
    ):
        model = MagicMock()
        load_model.return_value.to.return_value = model

        processor = MagicMock()
        processor.side_effect = lambda *, images, return_tensors: _FakeInputs(
            pixel_values=torch.tensor(
                [[image.getpixel((0, 0))[0]] for image in images],
                dtype=torch.float32,
            )
        )
        load_processor.return_value = processor

        def infer(pixel_values):
            if len(pixel_values) > 1:
                raise RuntimeError("batch allocation failed")
            return pixel_values.repeat(1, 512)

        model.get_image_features.side_effect = infer

        with patch.dict(
            os.environ,
            {"CLIP_IMAGE_BATCH_SIZE": "2", "CLIP_IMAGE_BATCH_WAIT_MS": "100"},
        ), patch("builtins.print"):
            embedder = clip_module.CLIPEmbedder("fake-clip")

        barrier = Barrier(3)
        results = [None, None]
        images = [
            Image.new("RGB", (8, 8), color=(30, 0, 0)),
            Image.new("RGB", (8, 8), color=(40, 0, 0)),
        ]

        def embed(index):
            barrier.wait()
            results[index] = embedder.embed_image(images[index])

        threads = [Thread(target=embed, args=(0,)), Thread(target=embed, args=(1,))]
        for thread in threads:
            thread.start()
        barrier.wait()
        for thread in threads:
            thread.join(timeout=2)
        embedder._image_batcher.close()

        self.assertEqual(model.get_image_features.call_count, 3)
        self.assertEqual(results[0][0], 30.0)
        self.assertEqual(results[1][0], 40.0)


class ClipTextPromptTests(unittest.TestCase):
    @patch.object(clip_module.CLIPProcessor, "from_pretrained")
    @patch.object(clip_module.CLIPModel, "from_pretrained")
    def test_short_query_uses_normalized_weighted_prompt_ensemble(
        self,
        load_model,
        load_processor,
    ):
        model = MagicMock()
        load_model.return_value.to.return_value = model

        processor = MagicMock()
        processor.return_value = _FakeInputs(
            input_ids=torch.tensor([[0], [1], [2]])
        )
        load_processor.return_value = processor

        features = torch.zeros((3, 512), dtype=torch.float32)
        features[0, 0] = 2.0
        features[1, 1] = 3.0
        features[2, 2] = 4.0
        model.get_text_features.return_value = features

        with patch("builtins.print"):
            embedder = clip_module.CLIPEmbedder("fake-clip")
        embedder.translator.translate = MagicMock()
        embedder.translator.translate_batch = MagicMock(
            return_value=[
                "black cat",
                "a photo with a black cat",
                "a photo focused on a black cat",
            ]
        )

        with patch("builtins.print"):
            vector = embedder.embed_text("mèo đen")
        embedder._image_batcher.close()

        embedder.translator.translate_batch.assert_called_once_with(
            [
                "mèo đen",
                "một bức ảnh có mèo đen",
                "một bức ảnh tập trung vào mèo đen",
            ]
        )
        embedder.translator.translate.assert_not_called()
        processor.assert_called_once_with(
            text=[
                "black cat",
                "a photo with a black cat",
                "a photo focused on a black cat",
            ],
            return_tensors="pt",
            padding=True,
        )
        expected_norm = (0.15**2 + 0.50**2 + 0.35**2) ** 0.5
        self.assertAlmostEqual(vector[0], 0.15 / expected_norm, places=6)
        self.assertAlmostEqual(vector[1], 0.50 / expected_norm, places=6)
        self.assertAlmostEqual(vector[2], 0.35 / expected_norm, places=6)
        self.assertAlmostEqual(
            torch.linalg.vector_norm(torch.tensor(vector)).item(),
            1.0,
            places=6,
        )

    @patch.object(clip_module.CLIPProcessor, "from_pretrained")
    @patch.object(clip_module.CLIPModel, "from_pretrained")
    def test_short_english_query_uses_direct_english_prompts_without_translation(
        self,
        load_model,
        load_processor,
    ):
        model = MagicMock()
        load_model.return_value.to.return_value = model

        processor = MagicMock()
        processor.return_value = _FakeInputs(
            input_ids=torch.tensor([[0], [1], [2]])
        )
        load_processor.return_value = processor
        model.get_text_features.return_value = torch.ones(
            (3, 512),
            dtype=torch.float32,
        )

        with patch("builtins.print"):
            embedder = clip_module.CLIPEmbedder("fake-clip")
        embedder.translator.translate = MagicMock()
        embedder.translator.translate_batch = MagicMock()

        with patch("builtins.print"):
            vector = embedder.embed_text("black cat")
        embedder._image_batcher.close()

        embedder.translator.translate.assert_not_called()
        embedder.translator.translate_batch.assert_not_called()
        processor.assert_called_once_with(
            text=[
                "black cat",
                "a photo of a black cat",
                "an image featuring a black cat",
            ],
            return_tensors="pt",
            padding=True,
        )
        self.assertEqual(len(vector), 512)

    def test_english_plural_and_uncountable_queries_do_not_add_article(self):
        self.assertFalse(
            clip_module.CLIPEmbedder._looks_like_vietnamese("black cat")
        )
        self.assertTrue(
            clip_module.CLIPEmbedder._looks_like_vietnamese("con nguoi")
        )
        self.assertEqual(
            clip_module.CLIPEmbedder._build_english_text_prompts("people"),
            ["people", "a photo of people", "an image featuring people"],
        )
        self.assertEqual(
            clip_module.CLIPEmbedder._build_english_text_prompts("water"),
            ["water", "a photo of water", "an image featuring water"],
        )

    @patch.object(clip_module.CLIPProcessor, "from_pretrained")
    @patch.object(clip_module.CLIPModel, "from_pretrained")
    def test_long_query_keeps_single_prompt_and_normalizes_vector(
        self,
        load_model,
        load_processor,
    ):
        model = MagicMock()
        load_model.return_value.to.return_value = model

        processor = MagicMock()
        processor.return_value = _FakeInputs(input_ids=torch.tensor([[0]]))
        load_processor.return_value = processor

        features = torch.zeros((1, 512), dtype=torch.float32)
        features[0, 0] = 3.0
        features[0, 1] = 4.0
        model.get_text_features.return_value = features

        with patch("builtins.print"):
            embedder = clip_module.CLIPEmbedder("fake-clip")
        translated_query = "a black cat sitting on a chair"
        embedder.translator.translate = MagicMock(return_value=translated_query)
        embedder.translator.translate_batch = MagicMock()

        with patch("builtins.print"):
            vector = embedder.embed_text("một con mèo đen đang ngồi trên ghế")
        embedder._image_batcher.close()

        embedder.translator.translate.assert_called_once_with(
            "một con mèo đen đang ngồi trên ghế"
        )
        embedder.translator.translate_batch.assert_not_called()
        processor.assert_called_once_with(
            text=[translated_query],
            return_tensors="pt",
            padding=True,
        )
        self.assertAlmostEqual(vector[0], 0.6, places=6)
        self.assertAlmostEqual(vector[1], 0.8, places=6)


if __name__ == "__main__":
    unittest.main()
