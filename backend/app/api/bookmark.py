"""Bookmark API for the current user."""

from pathlib import Path

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.errors import api_error
from app.db.session import get_db
from app.models.bookmark import Bookmark
from app.models.image import Image
from app.models.ocr_text import OCRText
from app.models.user import User
from app.schemas.bookmark import (
    BookmarkCreate,
    BookmarkDeleteResponse,
    BookmarkDetail,
    BookmarkImageIdsResponse,
    BookmarkItem,
    BookmarkListResponse,
)
from app.schemas.common import ImageStatus
from app.services.search import build_image_url, image_visible_to_user

router = APIRouter()


@router.get(
    "",
    response_model=BookmarkListResponse,
    response_model_by_alias=False,
    summary="List bookmarks",
    description="Return bookmarks of the current user. Requires Bearer access_token.",
    responses={200: {"description": "Bookmarks returned successfully."}, 401: {"description": "Missing, invalid, or expired token."}},
)
async def list_bookmarks(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkListResponse:
    """Return bookmarks of the current authenticated user."""
    filters = [
        Bookmark.user_id == current_user.id,
        image_visible_to_user(current_user.id),
        Image.status != ImageStatus.deleted,
    ]
    total = int(
        await db.scalar(
            select(func.count())
            .select_from(Bookmark)
            .join(Image, Image.id == Bookmark.image_id)
            .where(*filters)
        )
        or 0
    )
    offset = (page - 1) * limit
    rows = (
        await db.execute(
            select(Bookmark, Image)
            .join(Image, Image.id == Bookmark.image_id)
            .where(*filters)
            .order_by(Bookmark.created_at.desc(), Bookmark.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()

    return BookmarkListResponse(
        items=[_to_bookmark_item(bookmark, image) for bookmark, image in rows],
        page=page,
        limit=limit,
        total=total,
    )


@router.get(
    "/image-ids",
    response_model=BookmarkImageIdsResponse,
    response_model_by_alias=False,
    summary="List bookmarked image IDs",
    description="Used by the frontend to mark bookmarked search result cards. Requires Bearer access_token.",
    responses={200: {"description": "Bookmarked image IDs returned successfully."}, 401: {"description": "Missing, invalid, or expired token."}},
)
async def list_bookmarked_image_ids(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkImageIdsResponse:
    """Return bookmarked image IDs for marking search result cards."""
    image_ids = (
        await db.scalars(
            select(Bookmark.image_id)
            .join(Image, Image.id == Bookmark.image_id)
            .where(
                Bookmark.user_id == current_user.id,
                image_visible_to_user(current_user.id),
                Image.status != ImageStatus.deleted,
            )
            .order_by(Bookmark.created_at.desc(), Bookmark.id.desc())
        )
    ).all()
    return BookmarkImageIdsResponse(image_ids=list(image_ids))


@router.post(
    "",
    response_model=BookmarkItem,
    status_code=status.HTTP_201_CREATED,
    response_model_by_alias=False,
    summary="Create bookmark",
    description=(
        "Save an indexed image to the current user's bookmarks. "
        "Request body accepts image_id or imageId. If the image was already bookmarked, the existing bookmark is returned."
    ),
    responses={201: {"description": "Bookmark created successfully or existing bookmark returned."}, 400: {"description": "Image is not indexed and cannot be bookmarked."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Image not found."}, 422: {"description": "Invalid request body."}},
)
async def create_bookmark(
    payload: BookmarkCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkItem:
    """Save an indexed image to the current user's bookmarks."""
    image = await db.get(Image, payload.image_id)
    if image is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "IMAGE_NOT_FOUND", "Image not found.", {"imageId": payload.image_id})
    if image.owner_user_id not in (None, current_user.id):
        raise api_error(status.HTTP_404_NOT_FOUND, "IMAGE_NOT_FOUND", "Image not found.", {"imageId": payload.image_id})
    if image.status != ImageStatus.indexed:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "IMAGE_NOT_INDEXED",
            "Only indexed images can be bookmarked.",
            {"imageId": payload.image_id, "status": image.status},
        )

    existing = await db.scalar(
        select(Bookmark).where(Bookmark.user_id == current_user.id, Bookmark.image_id == payload.image_id)
    )
    if existing is not None:
        return _to_bookmark_item(existing, image)

    bookmark = Bookmark(user_id=current_user.id, image_id=payload.image_id)
    db.add(bookmark)
    await db.commit()
    await db.refresh(bookmark)
    return _to_bookmark_item(bookmark, image)


@router.delete(
    "/images/{image_id}",
    response_model=BookmarkDeleteResponse,
    summary="Delete bookmark by image ID",
    description="Used by the search result bookmark toggle when the frontend only has image_id. Requires Bearer access_token.",
    responses={200: {"description": "Bookmark removed successfully."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Bookmark not found."}},
)
async def delete_bookmark_by_image(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkDeleteResponse:
    """Delete a bookmark by image_id for search result toggle."""
    bookmark = await db.scalar(
        select(Bookmark).where(Bookmark.image_id == image_id, Bookmark.user_id == current_user.id)
    )
    if bookmark is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found.", {"imageId": image_id})

    await db.delete(bookmark)
    await db.commit()
    return BookmarkDeleteResponse(message="Bookmark removed.")


@router.get(
    "/{bookmark_id}",
    response_model=BookmarkDetail,
    response_model_by_alias=False,
    summary="Get bookmark detail",
    description="Return image metadata and OCR text for a bookmark owned by the current user. Requires Bearer access_token.",
    responses={200: {"description": "Bookmark detail returned successfully."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Bookmark not found or not owned by the current user."}},
)
async def get_bookmark_detail(
    bookmark_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkDetail:
    """Return bookmark detail with image metadata and OCR text."""
    row = (
        await db.execute(
            select(Bookmark, Image, OCRText)
            .join(Image, Image.id == Bookmark.image_id)
            .outerjoin(OCRText, OCRText.image_id == Image.id)
            .where(
                Bookmark.id == bookmark_id,
                Bookmark.user_id == current_user.id,
                image_visible_to_user(current_user.id),
                Image.status != ImageStatus.deleted,
            )
        )
    ).first()
    if row is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found.", {"bookmarkId": bookmark_id})

    bookmark, image, ocr_text = row
    return _to_bookmark_detail(bookmark, image, ocr_text)


@router.delete(
    "/{bookmark_id}",
    response_model=BookmarkDeleteResponse,
    summary="Delete bookmark by bookmark ID",
    description="Delete a bookmark owned by the current user by bookmark_id. Requires Bearer access_token.",
    responses={200: {"description": "Bookmark removed successfully."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Bookmark not found or not owned by the current user."}},
)
async def delete_bookmark(
    bookmark_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkDeleteResponse:
    """Delete a bookmark by bookmark_id."""
    bookmark = await db.scalar(
        select(Bookmark).where(Bookmark.id == bookmark_id, Bookmark.user_id == current_user.id)
    )
    if bookmark is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "BOOKMARK_NOT_FOUND", "Bookmark not found.", {"bookmarkId": bookmark_id})

    await db.delete(bookmark)
    await db.commit()
    return BookmarkDeleteResponse(message="Bookmark removed.")


def _to_bookmark_item(bookmark: Bookmark, image: Image) -> BookmarkItem:
    return BookmarkItem(
        id=bookmark.id,
        image_id=image.id,
        image_url=build_image_url(image.storage_path),
        title=_image_title(image),
        saved_at=bookmark.created_at,
        width=image.width,
        height=image.height,
        source=image.source_type.value if hasattr(image.source_type, "value") else str(image.source_type),
    )


def _to_bookmark_detail(bookmark: Bookmark, image: Image, ocr_text: OCRText | None) -> BookmarkDetail:
    item = _to_bookmark_item(bookmark, image).model_dump()
    return BookmarkDetail(
        **item,
        width=image.width,
        height=image.height,
        source=image.source_type.value if hasattr(image.source_type, "value") else str(image.source_type),
        ocr_text=ocr_text.raw_text if ocr_text else None,
    )


def _image_title(image: Image) -> str:
    if image.original_filename:
        return image.original_filename
    filename = Path(image.storage_path.replace("\\", "/")).name
    return filename or f"Image #{image.id}"
