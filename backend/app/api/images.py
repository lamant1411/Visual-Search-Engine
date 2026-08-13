"""Image library API for authenticated users."""

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.image import Image
from app.models.ocr_text import OCRText
from app.models.user import User
from app.schemas.common import ImageStatus
from app.schemas.image import (
    ImageBulkDeleteFailedItem,
    ImageBulkDeleteRequest,
    ImageBulkDeleteResponse,
    ImageBulkRestoreResponse,
    ImageDeleteResponse,
    ImageRestoreResponse,
)
from app.schemas.search import SearchResponse, SearchResultItem, SearchResultMetadata
from app.services.image_deletion import (
    delete_image_from_library,
    permanently_delete_image_from_library,
    restore_deleted_image,
)
from app.services.search import build_image_url

router = APIRouter()


@router.get(
    "",
    response_model=SearchResponse,
    summary="List image library",
    description=(
        "Return paginated active images (indexed, pending, failed) owned by the current authenticated user. "
        "Optional q filters by filename, storage path, or OCR text."
    ),
    responses={
        200: {"description": "Image library returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
    },
)
async def list_image_library(
    q: str | None = Query(None, min_length=1, max_length=255),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """Return active images owned by the current user."""
    filters = [Image.status != ImageStatus.deleted, Image.owner_user_id == current_user.id]
    return await _list_images(
        db=db,
        filters=filters,
        q=q,
        page=page,
        limit=limit,
    )


@router.get(
    "/deleted",
    response_model=SearchResponse,
    summary="List deleted images",
    description=(
        "Return paginated soft-deleted images owned or deleted by the current authenticated user. "
        "Private images from other users are not exposed."
    ),
    responses={
        200: {"description": "Deleted images returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
    },
)
async def list_deleted_images(
    q: str | None = Query(None, min_length=1, max_length=255),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchResponse:
    """Return soft-deleted images that the current user can restore or permanently delete."""
    filters = [
        Image.status == ImageStatus.deleted,
        or_(Image.owner_user_id == current_user.id, Image.deleted_by_user_id == current_user.id),
    ]
    return await _list_images(db=db, filters=filters, q=q, page=page, limit=limit)


@router.post(
    "/bulk-delete",
    response_model=ImageBulkDeleteResponse,
    summary="Soft delete multiple images from library",
    description=(
        "Soft delete multiple images from the current user image library. Images are hidden from search and normal library results, "
        "but remain available in the deleted images view for restore or permanent deletion."
    ),
    responses={
        200: {"description": "Bulk soft delete completed. Check deleted_items and failed_items for per-image result."},
        401: {"description": "Missing, invalid, or expired token."},
    },
)
async def bulk_delete_images_from_user_library(
    payload: ImageBulkDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImageBulkDeleteResponse:
    """Soft delete selected images from the current user library."""
    return await _bulk_delete(payload, current_user, db, permanent=False)


@router.post(
    "/bulk-restore",
    response_model=ImageBulkRestoreResponse,
    summary="Restore multiple deleted images",
    description="Restore multiple soft-deleted images owned or deleted by the current user back to their previous status.",
    responses={
        200: {"description": "Bulk restore completed. Check restored_items and failed_items for per-image result."},
        401: {"description": "Missing, invalid, or expired token."},
    },
)
async def bulk_restore_images(
    payload: ImageBulkDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImageBulkRestoreResponse:
    """Restore selected soft-deleted images."""
    restored_items: list[ImageRestoreResponse] = []
    failed_items: list[ImageBulkDeleteFailedItem] = []
    seen_image_ids: set[int] = set()

    for image_id in payload.image_ids:
        if image_id in seen_image_ids:
            continue
        seen_image_ids.add(image_id)

        try:
            result = await restore_deleted_image(
                db,
                image_id=image_id,
                requester_id=current_user.id,
                requester_role=current_user.role,
            )
            restored_items.append(
                ImageRestoreResponse(
                    image_id=result.image_id,
                    restored=result.restored,
                    status=result.status,
                )
            )
        except HTTPException as exc:
            failed_items.append(_to_failed_item(image_id, exc))

    return ImageBulkRestoreResponse(
        restored_items=restored_items,
        failed_items=failed_items,
        restored_count=len(restored_items),
        failed_count=len(failed_items),
    )


@router.post(
    "/bulk-permanent-delete",
    response_model=ImageBulkDeleteResponse,
    summary="Permanently delete multiple images",
    description="Permanently delete multiple soft-deleted images owned or deleted by the current user from DB, Qdrant metadata, bookmarks, OCR text, and local files.",
    responses={
        200: {"description": "Bulk permanent delete completed. Check deleted_items and failed_items for per-image result."},
        401: {"description": "Missing, invalid, or expired token."},
    },
)
async def bulk_permanently_delete_images(
    payload: ImageBulkDeleteRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImageBulkDeleteResponse:
    """Permanently delete selected soft-deleted images."""
    return await _bulk_delete(payload, current_user, db, permanent=True)


@router.post(
    "/{image_id}/restore",
    response_model=ImageRestoreResponse,
    summary="Restore deleted image",
    description="Restore a soft-deleted image owned or deleted by the current user back to its previous status.",
    responses={
        200: {"description": "Image restored successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not own this image."},
        404: {"description": "Image not found."},
        409: {"description": "Image is not currently deleted."},
    },
)
async def restore_image(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImageRestoreResponse:
    """Restore one soft-deleted image."""
    result = await restore_deleted_image(
        db,
        image_id=image_id,
        requester_id=current_user.id,
        requester_role=current_user.role,
    )
    return ImageRestoreResponse(image_id=result.image_id, restored=result.restored, status=result.status)


@router.delete(
    "/{image_id}/permanent",
    response_model=ImageDeleteResponse,
    summary="Permanently delete image",
    description="Permanently delete a soft-deleted image owned or deleted by the current user from DB, Qdrant metadata, bookmarks, OCR text, and local file.",
    responses={
        200: {"description": "Image permanently deleted successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not own this image."},
        404: {"description": "Image not found."},
        409: {"description": "Image is not currently deleted or is active in indexing."},
    },
)
async def permanently_delete_image(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImageDeleteResponse:
    """Permanently delete one soft-deleted image."""
    result = await permanently_delete_image_from_library(
        db,
        image_id=image_id,
        requester_id=current_user.id,
        requester_role=current_user.role,
    )
    return _to_delete_response(result)


@router.delete(
    "/{image_id}",
    response_model=ImageDeleteResponse,
    summary="Soft delete image from library",
    description=(
        "Soft delete an image from the current user image library. The image is hidden from search and normal library results, "
        "but remains available in the deleted images view for restore or permanent deletion."
    ),
    responses={
        200: {"description": "Image soft-deleted successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not own this image."},
        404: {"description": "Image not found."},
        409: {"description": "Image is currently queued or running in an indexing batch."},
    },
)
async def delete_image_from_user_library(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ImageDeleteResponse:
    """Soft delete one image owned by the current user."""
    result = await delete_image_from_library(
        db,
        image_id=image_id,
        requester_id=current_user.id,
        requester_role=current_user.role,
    )
    return _to_delete_response(result)


async def _list_images_by_status(
    *,
    db: AsyncSession,
    image_status: ImageStatus,
    q: str | None,
    page: int,
    limit: int,
    owner_user_id: int,
) -> SearchResponse:
    return await _list_images(
        db=db,
        filters=[Image.status == image_status, Image.owner_user_id == owner_user_id],
        q=q,
        page=page,
        limit=limit,
    )


async def _list_images(
    *,
    db: AsyncSession,
    filters: list,
    q: str | None,
    page: int,
    limit: int,
) -> SearchResponse:
    if q:
        keyword = f"%{q.strip()}%"
        filters.append(
            or_(
                Image.original_filename.ilike(keyword),
                Image.storage_path.ilike(keyword),
                OCRText.raw_text.ilike(keyword),
            )
        )

    total = int(
        await db.scalar(
            select(func.count())
            .select_from(Image)
            .outerjoin(OCRText, OCRText.image_id == Image.id)
            .where(*filters)
        )
        or 0
    )
    offset = (page - 1) * limit
    rows = (
        await db.execute(
            select(Image, OCRText)
            .outerjoin(OCRText, OCRText.image_id == Image.id)
            .where(*filters)
            .order_by(Image.updated_at.desc(), Image.created_at.desc(), Image.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()

    items: list[SearchResultItem] = []
    for image, ocr_text in rows:
        image_url = build_image_url(image.storage_path)
        source_type = image.source_type.value if hasattr(image.source_type, "value") else str(image.source_type)
        status_val = str(image.status.value if hasattr(image.status, "value") else image.status).lower()
        items.append(
            SearchResultItem(
                id=image.id,
                thumbnail_url=image_url,
                image_url=image_url,
                similarity_score=0,
                created_at=image.created_at,
                metadata=SearchResultMetadata(
                    width=image.width,
                    height=image.height,
                    source=source_type,
                    status=status_val,
                    ocr_text=ocr_text.raw_text if ocr_text else None,
                ),
            )
        )

    return SearchResponse(items=items, page=page, limit=limit, total=total)


async def _bulk_delete(
    payload: ImageBulkDeleteRequest,
    current_user: User,
    db: AsyncSession,
    *,
    permanent: bool,
) -> ImageBulkDeleteResponse:
    deleted_items: list[ImageDeleteResponse] = []
    failed_items: list[ImageBulkDeleteFailedItem] = []
    seen_image_ids: set[int] = set()

    for image_id in payload.image_ids:
        if image_id in seen_image_ids:
            continue
        seen_image_ids.add(image_id)

        try:
            if permanent:
                result = await permanently_delete_image_from_library(
                    db,
                    image_id=image_id,
                    requester_id=current_user.id,
                    requester_role=current_user.role,
                )
            else:
                result = await delete_image_from_library(
                    db,
                    image_id=image_id,
                    requester_id=current_user.id,
                    requester_role=current_user.role,
                )
            deleted_items.append(_to_delete_response(result))
        except HTTPException as exc:
            failed_items.append(_to_failed_item(image_id, exc))

    return ImageBulkDeleteResponse(
        deleted_items=deleted_items,
        failed_items=failed_items,
        deleted_count=len(deleted_items),
        failed_count=len(failed_items),
    )


def _to_delete_response(result) -> ImageDeleteResponse:
    return ImageDeleteResponse(
        image_id=result.image_id,
        deleted=result.deleted,
        file_deleted=result.file_deleted,
        qdrant_deleted=result.qdrant_deleted,
    )


def _to_failed_item(image_id: int, exc: HTTPException) -> ImageBulkDeleteFailedItem:
    detail = exc.detail if isinstance(exc.detail, dict) else {}
    return ImageBulkDeleteFailedItem(
        image_id=image_id,
        code=str(detail.get("code") or exc.status_code),
        message=str(detail.get("message") or exc.detail),
    )