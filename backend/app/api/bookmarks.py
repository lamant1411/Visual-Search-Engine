"""API bookmark cua nguoi dung dang dang nhap."""

from fastapi import APIRouter, Depends, Query, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.errors import api_error
from app.db.session import get_db
from app.models.user import User
from app.schemas.bookmark import (
    BookmarkImageIdsResponse,
    BookmarkItem,
    BookmarkListResponse,
)
from app.services.bookmark import (
    get_bookmark,
    list_bookmarked_image_ids,
    list_bookmarks,
    remove_bookmark,
    save_bookmark,
)

router = APIRouter()


@router.get("", response_model=BookmarkListResponse)
async def get_bookmarks(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkListResponse:
    items, total = await list_bookmarks(
        db,
        user_id=current_user.id,
        page=page,
        limit=limit,
    )
    return BookmarkListResponse(items=items, page=page, limit=limit, total=total)


@router.get("/image-ids", response_model=BookmarkImageIdsResponse)
async def get_bookmarked_image_ids(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkImageIdsResponse:
    image_ids = await list_bookmarked_image_ids(db, user_id=current_user.id)
    return BookmarkImageIdsResponse(image_ids=image_ids)


@router.get("/{image_id}", response_model=BookmarkItem)
async def get_bookmark_detail(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkItem:
    bookmark = await get_bookmark(db, user_id=current_user.id, image_id=image_id)
    if bookmark is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "BOOKMARK_NOT_FOUND",
            "Bookmark not found",
        )
    return bookmark


@router.put("/{image_id}", response_model=BookmarkItem)
async def put_bookmark(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> BookmarkItem:
    bookmark = await save_bookmark(db, user_id=current_user.id, image_id=image_id)
    if bookmark is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "IMAGE_NOT_FOUND", "Image not found")
    return bookmark


@router.delete("/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_bookmark(
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> Response:
    await remove_bookmark(db, user_id=current_user.id, image_id=image_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
