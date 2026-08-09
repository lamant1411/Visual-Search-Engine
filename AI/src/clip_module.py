import os
import io
import re
from functools import lru_cache
from threading import Lock
from time import perf_counter

from cpu_runtime import configure_torch_runtime
from dynamic_batcher import DynamicBatcher

import torch
import torch.nn.functional as F
from deep_translator import GoogleTranslator
from PIL import Image
from transformers import CLIPProcessor, CLIPModel


configure_torch_runtime(torch)

class CLIPEmbedder:
    _SHORT_QUERY_MAX_WORDS = 4
    _SHORT_QUERY_PROMPT_WEIGHTS = (0.15, 0.50, 0.35)
    _VIETNAMESE_CHARACTERS = frozenset(
        "ăâđêôơưáàảãạấầẩẫậắằẳẵặ"
        "éèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợ"
        "úùủũụứừửữựýỳỷỹỵ"
    )
    _VIETNAMESE_ASCII_HINTS = frozenset(
        {
            "bai",
            "bien",
            "chiec",
            "cho",
            "khong",
            "meo",
            "nguoi",
            "oto",
            "tieng",
            "duoc",
            "xe",
            "hoa",
            "cay",
            "qua",
            "nha",
            "nui",
            "song",
            "mua",
            "may",
            "gio",
            "nang",
            "bien",
        }
    )
    _ENGLISH_DETERMINERS = frozenset(
        {
            "a",
            "an",
            "any",
            "each",
            "every",
            "her",
            "his",
            "its",
            "many",
            "my",
            "one",
            "our",
            "several",
            "some",
            "that",
            "the",
            "their",
            "these",
            "this",
            "those",
            "two",
            "your",
        }
    )
    _ENGLISH_IRREGULAR_PLURALS = frozenset(
        {"children", "feet", "geese", "men", "mice", "people", "teeth", "women"}
    )
    _ENGLISH_UNCOUNTABLE_NOUNS = frozenset(
        {
            "air",
            "art",
            "clothing",
            "equipment",
            "food",
            "furniture",
            "grass",
            "information",
            "music",
            "nature",
            "news",
            "sand",
            "snow",
            "traffic",
            "water",
            "weather",
        }
    )

    def __init__(self, model_id="openai/clip-vit-base-patch32"):
        print(f"Đang tải mô hình {model_id}...")
        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self.model = CLIPModel.from_pretrained(model_id).to(self.device)
        self.model.eval()
        self.processor = CLIPProcessor.from_pretrained(model_id, use_fast=True)
        self._model_lock = Lock()
        self.image_batch_size = max(1, int(os.getenv("CLIP_IMAGE_BATCH_SIZE", "2")))
        self.image_batch_wait_seconds = max(
            0.0,
            float(os.getenv("CLIP_IMAGE_BATCH_WAIT_MS", "8")) / 1000.0,
        )
        self._image_batcher = DynamicBatcher(
            self._embed_image_batch,
            max_batch_size=self.image_batch_size,
            max_wait_seconds=self.image_batch_wait_seconds,
            name="clip-image-batcher",
        )
        
        # Khởi tạo bộ dịch: Ép source='vi' để tránh auto-detect sai khi dịch 1 từ ngắn (vd: "hoa")
        self.translator = GoogleTranslator(source='vi', target='en')
        print(f"Tải mô hình thành công trên {self.device.upper()}!\n")

    def embed_image(self, image_input) -> list:
        """
        Đọc ảnh từ đường dẫn, mảng bytes, hoặc đối tượng PIL Image và chuyển đổi thành vector 512 chiều.
        """
        try:
            # 1. Xử lý nếu đầu vào là đường dẫn file
            if isinstance(image_input, str):
                if not os.path.exists(image_input):
                    raise FileNotFoundError(f"Không tìm thấy ảnh tại: {image_input}")

                valid_extensions = ('.jpg', '.jpeg', '.png', '.webp')
                if not image_input.lower().endswith(valid_extensions):
                    raise ValueError(f"Định dạng không hợp lệ. Vui lòng dùng: {valid_extensions}")
                
                image = Image.open(image_input).convert("RGB")

            # 2. Xử lý nếu đầu vào là mảng bytes 
            elif isinstance(image_input, bytes):
                image = Image.open(io.BytesIO(image_input)).convert("RGB")

            # 3. Xử lý nếu đầu vào đã là một bức ảnh được mở sẵn
            elif isinstance(image_input, Image.Image):
                image = image_input.convert("RGB")
                
            else:
                raise TypeError("Đầu vào phải là đường dẫn (str), mảng bytes, hoặc đối tượng PIL.Image")

            # Đưa ảnh vào mô hình để trích xuất đặc trưng
            return self._image_batcher.submit(image)
        
        except Exception as e:
            print(f"Lỗi khi xử lý ảnh trong mô hình CLIP: {e}")
            return None

    def warm_up(self) -> float:
        """Warm both single-image and normal two-image inference shapes."""
        started_at = perf_counter()
        image = Image.new("RGB", (640, 480), color="white")
        single_vectors = self._embed_image_batch([image])
        batched_vectors = self._embed_image_batch([image, image])
        if len(single_vectors) != 1 or len(batched_vectors) != 2:
            raise RuntimeError("CLIP warm-up failed.")
        return perf_counter() - started_at

    def _embed_image_batch(self, images) -> list[list[float]]:
        started_at = perf_counter()
        used_fallback = False
        try:
            vectors = self._run_image_forward(images)
        except RuntimeError:
            if len(images) <= 1:
                raise
            # A two-image batch can exceed available memory on smaller hosts.
            # Preserve correctness by retrying the same images individually.
            used_fallback = True
            vectors = []
            for image in images:
                vectors.extend(self._run_image_forward([image]))

        if len(images) > 1:
            elapsed = perf_counter() - started_at
            print(
                f"[CLIP batch] size={len(images)} elapsed={elapsed:.3f}s "
                f"fallback={str(used_fallback).lower()}",
                flush=True,
            )
        return vectors

    def _run_image_forward(self, images) -> list[list[float]]:
        inputs = self.processor(images=list(images), return_tensors="pt").to(self.device)

        with self._model_lock, torch.inference_mode():
            image_features = self.model.get_image_features(**inputs)

        return image_features.detach().cpu().numpy().tolist()

    def embed_text(self, query: str) -> list:
        """
        Dịch truy vấn và chuyển thành vector 512 chiều.
        """
        if not query or not query.strip():
            raise ValueError("Query tìm kiếm không được để trống.")

        try:
            # CLIP's tokenizer is case-insensitive. A canonical key lets repeated
            # searches skip both online translation and model inference.
            normalized_query = " ".join(query.strip().split()).casefold()
            return list(self._embed_text_cached(normalized_query))
        except Exception as e:
            print(f"Lỗi khi xử lý text trong mô hình CLIP: {e}")
            return None

    @lru_cache(maxsize=1024)
    def _embed_text_cached(self, query: str) -> tuple[float, ...]:
        """Embed a canonical query and retain hot query vectors in memory."""
        try:
            # Query Việt ngắn được thêm ngữ cảnh trước khi dịch; query Anh
            # ngắn dùng prompt tiếng Anh trực tiếp để tránh câu trộn hai ngôn ngữ.
            source_prompts, weights = self._build_source_text_prompts(query)
            is_short_query = len(source_prompts) > 1
            is_english_short_query = is_short_query and not self._looks_like_vietnamese(query)

            if is_english_short_query:
                prompts = self._build_english_text_prompts(source_prompts[0])
                print(f"[AI Service] English query: '{query}' -> Prompts: {prompts}")
            elif is_short_query:
                # Translate only the noun phrase once. Building the contextual
                # English prompts locally avoids three sequential network calls.
                translated_query = self._translate_query(source_prompts[0])
                prompts = self._build_english_text_prompts(translated_query)
                print(f"[AI Service] Query gốc: '{query}' -> Đã dịch: {prompts}")
            else:
                prompts = [self._translate_query(source_prompts[0])]
                print(f"[AI Service] Query gốc: '{query}' -> Đã dịch: {prompts}")

            if len(prompts) > 1:
                print(
                    "[AI Service] Short-query contextual prompt ensemble: "
                    f"{list(zip(prompts, weights))}"
                )

            # Chạy toàn bộ prompt trong một forward pass để giữ latency thấp.
            inputs = self.processor(
                text=prompts,
                return_tensors="pt",
                padding=True,
            ).to(self.device)
            
            with self._model_lock, torch.inference_mode():
                text_features = self.model.get_text_features(**inputs)

            # Chuẩn hóa từng prompt trước khi trộn để magnitude không làm
            # lệch trọng số, sau đó chuẩn hóa lại vector truy vấn cuối.
            normalized_features = F.normalize(text_features, p=2, dim=-1)
            prompt_weights = normalized_features.new_tensor(weights).unsqueeze(1)
            query_features = torch.sum(
                normalized_features * prompt_weights,
                dim=0,
            )
            query_features = F.normalize(query_features, p=2, dim=0)

            return tuple(query_features.detach().cpu().tolist())
        except Exception:
            # lru_cache only stores successful calls; transient translation or
            # inference failures remain retryable on the next request.
            raise

    def _build_source_text_prompts(self, query: str) -> tuple[list[str], list[float]]:
        cleaned_query = " ".join(query.strip().split())
        word_count = len(cleaned_query.split())

        if word_count > self._SHORT_QUERY_MAX_WORDS:
            return [cleaned_query], [1.0]

        prompts = [
            cleaned_query,
            f"một bức ảnh có {cleaned_query}",
            f"một bức ảnh tập trung vào {cleaned_query}",
        ]
        return prompts, list(self._SHORT_QUERY_PROMPT_WEIGHTS)

    @classmethod
    def _looks_like_vietnamese(cls, query: str) -> bool:
        normalized_query = query.casefold()
        if any(character in cls._VIETNAMESE_CHARACTERS for character in normalized_query):
            return True

        ascii_words = set(re.findall(r"[a-z]+", normalized_query))
        return bool(ascii_words & cls._VIETNAMESE_ASCII_HINTS)

    @classmethod
    def _build_english_text_prompts(cls, query: str) -> list[str]:
        cleaned_query = " ".join(query.strip().split())
        subject = cls._add_english_indefinite_article(cleaned_query)
        return [
            cleaned_query,
            f"a photo of {subject}",
            f"an image featuring {subject}",
        ]

    @classmethod
    def _add_english_indefinite_article(cls, query: str) -> str:
        words = re.findall(r"[a-z]+(?:'[a-z]+)?", query.casefold())
        if not words:
            return query

        first_word = words[0]
        last_word = words[-1]
        has_determiner = first_word in cls._ENGLISH_DETERMINERS
        is_irregular_plural = (
            first_word in cls._ENGLISH_IRREGULAR_PLURALS
            or last_word in cls._ENGLISH_IRREGULAR_PLURALS
        )
        is_regular_plural = last_word.endswith("s") and not last_word.endswith(
            ("is", "ss", "us")
        )
        is_uncountable = last_word in cls._ENGLISH_UNCOUNTABLE_NOUNS

        if has_determiner or is_irregular_plural or is_regular_plural or is_uncountable:
            return query

        article = "an" if first_word[0] in "aeiou" else "a"
        return f"{article} {query}"

    @lru_cache(maxsize=1024)
    def _translate_query(self, query: str) -> str:
        translated_query = self.translator.translate(query)
        if not isinstance(translated_query, str) or not translated_query.strip():
            raise ValueError("Bộ dịch trả về query không hợp lệ.")
        return " ".join(translated_query.strip().split())
