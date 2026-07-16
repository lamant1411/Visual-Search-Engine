"""Endpoint tìm kiếm bằng ảnh."""

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.errors import api_error
from app.db.session import get_db
from app.models.user import User
from app.schemas.search import SearchResponse
from app.services.ai_service import AIServiceError, ai_embedding_client
from app.services.qdrant_service import QdrantSearchService
from app.services.search import build_search_response_from_hits

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@router.post("/image", response_model=SearchResponse)
async def search_by_image(
    file: UploadFile | None = File(None),
    image_id: int | None = Form(None),
    image_url: str | None = Form(None, alias="imageUrl"),
    page: int = Form(1),
    limit: int = Form(20),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """Nhận ảnh từ frontend và trả kết quả tìm kiếm theo contract đã thống nhất."""
    del current_user
    _validate_pagination(page, limit)

    if file is None and image_id is None and not image_url:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "Image search requires file, image_id, or imageUrl.",
            {"fields": ["file", "image_id", "imageUrl"]},
        )

    if file is None:
        raise api_error(
            status.HTTP_501_NOT_IMPLEMENTED,
            "NOT_IMPLEMENTED",
            "Search by image_id or imageUrl is not implemented yet.",
            {"fields": ["image_id", "imageUrl"]},
        )

    content = await _read_and_validate_upload_file(file)

    try:
        vector = await ai_embedding_client.embed_image(
            content,
            filename=file.filename or "image",
            content_type=file.content_type or "application/octet-stream",
        )
        max_results = max(limit, settings.image_search_max_results)
        all_hits = QdrantSearchService().search(vector, limit=max_results)
        offset = (page - 1) * limit
        hits = all_hits[offset : offset + limit]
    except AIServiceError as exc:
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI_SERVICE_UNAVAILABLE",
            str(exc),
        ) from exc
    except Exception as exc:
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "VECTOR_SEARCH_UNAVAILABLE",
            "Vector search service is unavailable.",
        ) from exc

    return await build_search_response_from_hits(
        db,
        hits,
        page=page,
        limit=limit,
        total=len(all_hits),
    )


def _validate_pagination(page: int, limit: int) -> None:
    if page < 1:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "page must be >= 1.",
            {"field": "page"},
        )
    if limit < 1 or limit > 100:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "limit must be between 1 and 100.",
            {"field": "limit", "min": 1, "max": 100},
        )


async def _read_and_validate_upload_file(file: UploadFile) -> bytes:
    filename = file.filename or ""
    lower_filename = filename.lower()
    has_valid_extension = any(lower_filename.endswith(ext) for ext in ALLOWED_IMAGE_EXTENSIONS)

    if file.content_type not in ALLOWED_IMAGE_TYPES or not has_valid_extension:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "Only JPG, PNG, and WebP images are supported.",
            {
                "field": "file",
                "allowedContentTypes": sorted(ALLOWED_IMAGE_TYPES),
                "allowedExtensions": sorted(ALLOWED_IMAGE_EXTENSIONS),
            },
        )

    max_bytes = settings.image_search_max_upload_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise api_error(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "PAYLOAD_TOO_LARGE",
            f"Image must be <= {settings.image_search_max_upload_mb}MB.",
            {"field": "file", "maxMb": settings.image_search_max_upload_mb},
        )

    await file.seek(0)
    return content
