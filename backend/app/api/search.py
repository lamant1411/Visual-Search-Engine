"""Endpoint tìm kiếm bằng ảnh."""

import uuid
from pathlib import Path
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.errors import api_error
from app.db.session import get_db
from app.models.image import Image
from app.models.image_embedding import ImageEmbedding
from app.models.search_history import SearchHistory
from app.models.user import User
from app.schemas.common import ImageStatus, SearchQueryType
from app.schemas.search import SearchResponse
from app.services.ai_service import AIServiceError, ai_embedding_client
from app.services.qdrant_service import QdrantSearchService
from app.services.search import (
    build_image_url,
    build_search_response_from_hits,
    extract_explicit_ocr_query,
    image_visible_to_user,
    search_images_by_ocr_text,
)

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@router.post(
    "/image",
    response_model=SearchResponse,
    summary="Search by uploaded image",
    description=(
        "Receive multipart/form-data with an image file and pagination fields. "
        "Support uploaded files, indexed image_id values, and stored /static imageUrl values. "
        "Requires Bearer access_token."
    ),
    responses={
        200: {"description": "Search completed successfully."},
        400: {"description": "Missing file or unsupported file type. Only JPG, PNG, and WebP are supported."},
        401: {"description": "Missing, invalid, or expired token."},
        413: {"description": "Uploaded file exceeds the allowed size."},
        404: {"description": "The requested image_id does not exist."},
        409: {"description": "The requested image has not finished indexing."},
        503: {"description": "AI service or vector search service is unavailable."},
    },
)
async def search_by_image(
    file: UploadFile | None = File(None),
    image_id: int | None = Form(None),
    image_url: str | None = Form(None, alias="imageUrl"),
    history_key: str | None = Form(None, alias="historyKey"),
    page: int = Form(1),
    limit: int = Form(20),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """Nhận ảnh từ frontend và trả kết quả tìm kiếm theo contract đã thống nhất."""
    _validate_pagination(page, limit)

    if file is None and image_id is None and not image_url:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "Image search requires file, image_id, or imageUrl.",
            {"fields": ["file", "image_id", "imageUrl"]},
        )

    content: bytes | None = None
    vector: list[float] | None = None
    source_image_id: int | None = None
    history_image_url: str | None = None
    embedding: ImageEmbedding | None = None
    if file is not None:
        content = await _read_and_validate_upload_file(file)
        query_filename = file.filename or "uploaded_image"
        query_content_type = file.content_type or "application/octet-stream"
        should_save_history = True
    elif image_id is not None:
        image = await db.get(Image, image_id)
        if image is None:
            raise api_error(
                status.HTTP_404_NOT_FOUND,
                "IMAGE_NOT_FOUND",
                "Image not found.",
                {"imageId": image_id},
            )
        if image.owner_user_id not in (None, current_user.id):
            raise api_error(
                status.HTTP_404_NOT_FOUND,
                "IMAGE_NOT_FOUND",
                "Image not found.",
                {"imageId": image_id},
            )
        if image.status != ImageStatus.indexed:
            raise api_error(
                status.HTTP_409_CONFLICT,
                "IMAGE_NOT_READY",
                "Image has not finished indexing.",
                {"imageId": image_id, "status": image.status},
            )

        embedding = await db.get(ImageEmbedding, image_id)
        if embedding is None or embedding.vector_status != "synced":
            raise api_error(
                status.HTTP_409_CONFLICT,
                "IMAGE_EMBEDDING_NOT_READY",
                "Image embedding is not ready for similarity search.",
                {"imageId": image_id},
            )

        query_filename = image.original_filename or Path(
            image.storage_path.replace("\\", "/")
        ).name
        query_content_type = image.mime_type or _guess_image_content_type(query_filename)
        source_image_id = image.id
        history_image_url = build_image_url(image.storage_path)
        should_save_history = True
    else:
        image = await _get_owned_image_by_url(db, image_url or "", current_user.id)
        content = _read_static_image_url(image_url or "")
        query_filename = image.original_filename or Path(urlparse(image_url or "").path).name or "history_image"
        query_content_type = _guess_image_content_type(query_filename)
        should_save_history = False

    vector_search = QdrantSearchService()
    try:
        if embedding is not None:
            vector = vector_search.get_vector(
                embedding.qdrant_point_id,
                collection_name=embedding.collection_name,
            )
        else:
            vector = await ai_embedding_client.embed_image(
                content or b"",
                filename=query_filename,
                content_type=query_content_type,
            )

        if vector is None or len(vector) != settings.image_embedding_dim:
            raise ValueError("Stored image embedding is missing or has an invalid dimension.")

        max_results = max(page * limit, settings.image_search_max_results) + (
            1 if source_image_id else 0
        )
        all_hits = vector_search.search(vector, limit=max_results, owner_user_id=current_user.id)
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

    if source_image_id is not None:
        all_hits = [hit for hit in all_hits if hit.image_id != source_image_id]

    response = await build_search_response_from_hits(
        db,
        all_hits,
        page=page,
        limit=limit,
        owner_user_id=current_user.id,
    )
    if page == 1 and should_save_history:
        existing_history = None
        if history_key:
            existing_history = await db.scalar(
                select(SearchHistory).where(
                    SearchHistory.user_id == current_user.id,
                    SearchHistory.query_type == SearchQueryType.image,
                    SearchHistory.client_history_key == history_key,
                )
            )

        if existing_history is None:
            query_image_url = history_image_url
            if query_image_url is None:
                query_image_url = _save_query_image_for_history(
                    content=content or b"",
                    filename=query_filename,
                    user_id=current_user.id,
                )
            db.add(
                SearchHistory(
                    user_id=current_user.id,
                    query_type=SearchQueryType.image,
                    query_value=query_filename,
                    query_image_url=query_image_url,
                    client_history_key=history_key,
                )
            )
            await db.commit()
    return response


@router.get(
    "/text",
    response_model=SearchResponse,
    summary="Unified semantic and OCR text search",
    description=(
        "Search the shared catalogue and the current user's images using CLIP semantic retrieval "
        "plus OCR text retrieval. Explicit requests such as 'ảnh có chữ Nhím' are routed to OCR; "
        "other text queries are routed to CLIP semantic search. Requires Bearer access_token."
    ),
    responses={
        200: {"description": "Search completed successfully."},
        400: {"description": "Query is empty after trimming."},
        401: {"description": "Missing, invalid, or expired token."},
        422: {"description": "Invalid query parameters."},
        503: {"description": "AI service or vector search service is unavailable."},
    },
)
async def search_by_text(
    q: str = Query(..., min_length=1, max_length=500, description="Text query for unified semantic and OCR search"),
    page: int = Query(1, ge=1, description="Current page"),
    limit: int = Query(20, ge=1, le=100, description="Number of results per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """Run one text query through the appropriate semantic/OCR retrieval path."""
    query = q.strip()
    if not query:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "Query không được để trống sau khi strip.",
            {"field": "q"},
        )

    explicit_ocr_query = extract_explicit_ocr_query(query)
    max_results = max(page * limit, settings.image_search_max_results)

    if explicit_ocr_query is not None:
        response = await search_images_by_ocr_text(
            db,
            explicit_ocr_query,
            page=page,
            limit=limit,
            owner_user_id=current_user.id,
        )
    else:
        try:
            vector = await ai_embedding_client.embed_text(query)
            all_hits = QdrantSearchService().search(
                vector,
                limit=max_results,
                owner_user_id=current_user.id,
            )
            semantic_response = await build_search_response_from_hits(
                db,
                all_hits,
                page=1,
                limit=max_results,
                owner_user_id=current_user.id,
            )
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

        response = await build_search_response_from_hits(
            db,
            all_hits,
            page=page,
            limit=limit,
            owner_user_id=current_user.id,
        )
    if page == 1:
        db.add(
            SearchHistory(
                user_id=current_user.id,
                query_type=(
                    SearchQueryType.ocr
                    if explicit_ocr_query is not None
                    else SearchQueryType.semantic
                ),
                query_value=query,
            )
        )
        await db.commit()
    return response


@router.get(
    "/ocr",
    response_model=SearchResponse,
    summary="Search by OCR text",
    description=(
        "Search images whose OCR text matches query q using PostgreSQL full-text search with ILIKE fallback. "
        "Requires Bearer access_token."
    ),
    responses={
        200: {"description": "Search completed successfully."},
        400: {"description": "Query is empty after trimming."},
        401: {"description": "Missing, invalid, or expired token."},
        422: {"description": "Invalid query parameters."},
    },
)
async def search_by_ocr(
    q: str = Query(..., min_length=1, max_length=500, description="Text to search within image OCR content"),
    page: int = Query(1, ge=1, description="Current page"),
    limit: int = Query(20, ge=1, le=100, description="Number of results per page"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """Tìm ảnh có chứa text được nhận diện bằng OCR khớp với query.

    Dùng PostgreSQL full-text search (plainto_tsquery) kết hợp ILIKE fallback.
    Kết quả được sắp xếp theo độ liên quan (ts_rank) giảm dần.
    """
    query = q.strip()
    if not query:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "Query không được để trống sau khi strip.",
            {"field": "q"},
        )

    response = await search_images_by_ocr_text(db, query, page=page, limit=limit, owner_user_id=current_user.id)
    if page == 1:
        db.add(
            SearchHistory(
                user_id=current_user.id,
                query_type=SearchQueryType.ocr,
                query_value=query,
            )
        )
        await db.commit()
    return response


async def _get_owned_image_by_url(db: AsyncSession, image_url: str, owner_user_id: int) -> Image:
    storage_path = _normalize_static_image_url_to_storage_path(image_url)
    image = await db.scalar(
        select(Image).where(
            Image.storage_path == storage_path,
            image_visible_to_user(owner_user_id),
        )
    )
    if image is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "IMAGE_NOT_FOUND",
            "Image not found.",
            {"field": "imageUrl"},
        )
    if image.status != ImageStatus.indexed:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "IMAGE_NOT_READY",
            "Image has not finished indexing.",
            {"imageId": image.id, "status": image.status},
        )
    return image


def _normalize_static_image_url_to_storage_path(image_url: str) -> str:
    parsed = urlparse(image_url)
    raw_path = parsed.path if parsed.scheme or parsed.netloc else image_url
    normalized_path = unquote(raw_path).replace("\\", "/").strip()
    if normalized_path.startswith("static/"):
        return f"/{normalized_path}"
    if normalized_path.startswith("/static/"):
        return normalized_path
    raise api_error(
        status.HTTP_400_BAD_REQUEST,
        "VALIDATION_ERROR",
        "imageUrl must point to a stored /static image.",
        {"field": "imageUrl"},
    )


def _read_static_image_url(image_url: str) -> bytes:
    path = _resolve_static_image_url(image_url)
    content = path.read_bytes()
    if len(content) > settings.image_search_max_upload_mb * 1024 * 1024:
        raise api_error(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "PAYLOAD_TOO_LARGE",
            f"Image must be <= {settings.image_search_max_upload_mb}MB.",
            {"field": "imageUrl", "maxMb": settings.image_search_max_upload_mb},
        )
    return content


def _resolve_static_image_url(image_url: str) -> Path:
    parsed = urlparse(image_url)
    raw_path = parsed.path if parsed.scheme or parsed.netloc else image_url
    normalized_path = unquote(raw_path).replace("\\", "/").strip()

    if normalized_path.startswith("static/"):
        relative_path = normalized_path.removeprefix("static/")
    elif normalized_path.startswith("/static/"):
        relative_path = normalized_path.removeprefix("/static/")
    else:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "imageUrl must point to a stored /static image.",
            {"field": "imageUrl"},
        )

    static_root = Path(settings.static_files_dir).resolve()
    target_path = (static_root / relative_path).resolve()
    if target_path != static_root and static_root not in target_path.parents:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "Resolved image path is outside the static directory.",
            {"field": "imageUrl"},
        )
    if not target_path.is_file():
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            "Image referenced by imageUrl was not found.",
            {"field": "imageUrl"},
        )
    if target_path.suffix.lower() not in ALLOWED_IMAGE_EXTENSIONS:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "Only JPG, PNG, and WebP images are supported.",
            {"field": "imageUrl"},
        )
    return target_path


def _guess_image_content_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix in {".jpg", ".jpeg"}:
        return "image/jpeg"
    if suffix == ".png":
        return "image/png"
    if suffix == ".webp":
        return "image/webp"
    return "application/octet-stream"


def _save_query_image_for_history(*, content: bytes, filename: str, user_id: int) -> str:
    storage_dir = Path(settings.static_files_dir) / "images" / "search_history" / str(user_id)
    storage_dir.mkdir(parents=True, exist_ok=True)

    safe_name = _safe_history_filename(filename)
    target = storage_dir / f"{uuid.uuid4().hex}_{safe_name}"
    target.write_bytes(content)
    return f"/static/images/search_history/{user_id}/{target.name}"


def _safe_history_filename(filename: str) -> str:
    clean_name = Path(filename).name.strip().replace(" ", "_")
    allowed_chars = []
    for char in clean_name:
        if char.isalnum() or char in {".", "_", "-"}:
            allowed_chars.append(char)
    safe_name = "".join(allowed_chars).strip("._-")
    return safe_name or "uploaded_image.jpg"


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
