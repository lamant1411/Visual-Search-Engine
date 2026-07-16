"""Client giao tiếp với dịch vụ embedding của nhóm AI."""

from typing import Any

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import settings


class AIServiceError(Exception):
    """Lỗi khi không thể lấy embedding hợp lệ từ AI service."""


class EmbeddingResponse(BaseModel):
    vector: list[float]


# Alias cho image embedding (giữ tương thích với code cũ).
ImageEmbeddingResponse = EmbeddingResponse


class AIEmbeddingClient:
    """Che giấu contract AI để Search API không phụ thuộc chi tiết triển khai."""

    async def embed_image(
        self,
        content: bytes,
        *,
        filename: str,
        content_type: str,
    ) -> list[float]:
        url = self._build_url(settings.ai_image_embedding_path)

        try:
            async with httpx.AsyncClient(timeout=settings.ai_service_timeout_seconds) as client:
                response = await client.post(
                    url,
                    files={"file": (filename, content, content_type)},
                )
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise AIServiceError("AI service timed out while embedding the image.") from exc
        except httpx.HTTPStatusError as exc:
            raise AIServiceError(
                f"AI service returned status {exc.response.status_code}."
            ) from exc
        except httpx.RequestError as exc:
            raise AIServiceError("AI service is unavailable.") from exc

        payload = self._parse_payload(response)
        if len(payload.vector) != settings.image_embedding_dim:
            raise AIServiceError(
                "AI service returned an invalid embedding dimension: "
                f"expected {settings.image_embedding_dim}, got {len(payload.vector)}."
            )
        return payload.vector

    async def embed_text(self, query: str) -> list[float]:
        """Gọi AI Service để chuyển text query thành vector CLIP 512 chiều."""
        url = self._build_url(settings.ai_text_embedding_path)

        try:
            async with httpx.AsyncClient(timeout=settings.ai_service_timeout_seconds) as client:
                response = await client.post(url, data={"text": query})
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise AIServiceError("AI service timed out while embedding text.") from exc
        except httpx.HTTPStatusError as exc:
            raise AIServiceError(
                f"AI service returned status {exc.response.status_code}."
            ) from exc
        except httpx.RequestError as exc:
            raise AIServiceError("AI service is unavailable.") from exc

        payload = self._parse_payload(response)
        if len(payload.vector) != settings.image_embedding_dim:
            raise AIServiceError(
                "AI service returned an invalid embedding dimension: "
                f"expected {settings.image_embedding_dim}, got {len(payload.vector)}."
            )
        return payload.vector

    @staticmethod
    def _parse_payload(response: httpx.Response) -> ImageEmbeddingResponse:
        try:
            data: Any = response.json()
            return ImageEmbeddingResponse.model_validate(data)
        except (ValueError, ValidationError) as exc:
            raise AIServiceError("AI service returned an invalid response body.") from exc

    @staticmethod
    def _build_url(path: str) -> str:
        return f"{settings.ai_service_url.rstrip('/')}/{path.lstrip('/')}"


ai_embedding_client = AIEmbeddingClient()
