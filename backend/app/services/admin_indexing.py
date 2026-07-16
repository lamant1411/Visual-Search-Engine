"""Client gọi các API indexing của AI service."""

from typing import Any

import httpx
from pydantic import BaseModel, ValidationError

from app.core.config import settings
from app.schemas.common import BatchStatus


class AIIndexingServiceError(Exception):
    """Lỗi khi BE không thể giao tiếp với AI indexing service."""


class AIIndexStartPayload(BaseModel):
    batch_id: str
    status: BatchStatus
    total_images: int


class AIIndexStatusPayload(BaseModel):
    batch_id: str
    status: BatchStatus
    total_images: int = 0
    processed_images: int = 0
    failed_images: int = 0
    error_message: str | None = None


class AIIndexingClient:
    """Che giấu contract AI indexing để API Admin chỉ phụ thuộc vào service này."""

    async def start_local_indexing(
        self,
        *,
        batch_id: str,
        image_folder: str,
        storage_prefix: str,
        max_images: int,
        run_all: bool,
    ) -> AIIndexStartPayload:
        data = await self._post_json(
            settings.ai_index_local_path,
            {
                "batch_id": batch_id,
                "image_folder": image_folder,
                "storage_prefix": storage_prefix,
                "max_images": max_images,
                "run_all": run_all,
            },
        )
        return self._validate_start_payload(data)

    async def get_indexing_status(self, batch_id: str) -> AIIndexStatusPayload:
        path = settings.ai_index_status_path.format(batch_id=batch_id)
        try:
            async with httpx.AsyncClient(timeout=settings.ai_service_timeout_seconds) as client:
                response = await client.get(self._build_url(path))
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise AIIndexingServiceError("AI indexing service timed out.") from exc
        except httpx.HTTPStatusError as exc:
            raise AIIndexingServiceError(
                f"AI indexing service returned status {exc.response.status_code}."
            ) from exc
        except httpx.RequestError as exc:
            raise AIIndexingServiceError("AI indexing service is unavailable.") from exc

        try:
            return AIIndexStatusPayload.model_validate(response.json())
        except (ValueError, ValidationError) as exc:
            raise AIIndexingServiceError("AI indexing service returned invalid status payload.") from exc

    async def _post_json(self, path: str, payload: dict[str, Any]) -> dict[str, Any]:
        try:
            async with httpx.AsyncClient(timeout=settings.ai_service_timeout_seconds) as client:
                response = await client.post(self._build_url(path), json=payload)
                response.raise_for_status()
        except httpx.TimeoutException as exc:
            raise AIIndexingServiceError("AI indexing service timed out.") from exc
        except httpx.HTTPStatusError as exc:
            raise AIIndexingServiceError(
                f"AI indexing service returned status {exc.response.status_code}."
            ) from exc
        except httpx.RequestError as exc:
            raise AIIndexingServiceError("AI indexing service is unavailable.") from exc

        try:
            return response.json()
        except ValueError as exc:
            raise AIIndexingServiceError("AI indexing service returned invalid JSON.") from exc

    @staticmethod
    def _validate_start_payload(data: dict[str, Any]) -> AIIndexStartPayload:
        try:
            return AIIndexStartPayload.model_validate(data)
        except ValidationError as exc:
            raise AIIndexingServiceError("AI indexing service returned invalid start payload.") from exc

    @staticmethod
    def _build_url(path: str) -> str:
        return f"{settings.ai_service_url.rstrip('/')}/{path.lstrip('/')}"


ai_indexing_client = AIIndexingClient()