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


if __name__ == "__main__":
    unittest.main()
