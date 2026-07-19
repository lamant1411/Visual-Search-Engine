"""Nghiep vu luu va doc bookmark cua nguoi dung."""

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.bookmark import Bookmark
from app.models.image import Image
from app.models.ocr_text import OCRText
from app.schemas.bookmark import BookmarkItem, BookmarkMetadata
from app.services.search import build_image_url


async def list_bookmarks(
    db: AsyncSession,
    *,
    user_id: int,
    page: int,
    limit: int,
) -> tuple[list[BookmarkItem], int]:
    total = int(
        await db.scalar(
            select(func.count())
            .select_from(Bookmark)
            .where(Bookmark.user_id == user_id)
        )
        or 0
    )
    offset = (page - 1) * limit
    rows = await db.execute(
        _bookmark_rows_query(user_id=user_id)
        .order_by(Bookmark.created_at.desc(), Bookmark.id.desc())
        .offset(offset)
        .limit(limit)
    )

    return [_build_bookmark_item(*row) for row in rows.all()], total


async def list_bookmarked_image_ids(db: AsyncSession, *, user_id: int) -> list[int]:
    return list(
        (
            await db.scalars(
                select(Bookmark.image_id)
                .where(Bookmark.user_id == user_id)
                .order_by(Bookmark.image_id)
            )
        ).all()
    )


async def get_bookmark(
    db: AsyncSession,
    *,
    user_id: int,
    image_id: int,
) -> BookmarkItem | None:
    row = (
        await db.execute(
            _bookmark_rows_query(user_id=user_id, image_id=image_id)
        )
    ).one_or_none()
    return _build_bookmark_item(*row) if row else None


async def save_bookmark(
    db: AsyncSession,
    *,
    user_id: int,
    image_id: int,
) -> BookmarkItem | None:
    existing = await get_bookmark(db, user_id=user_id, image_id=image_id)
    if existing is not None:
        return existing

    if await db.get(Image, image_id) is None:
        return None

    db.add(Bookmark(user_id=user_id, image_id=image_id))
    try:
        await db.commit()
    except IntegrityError:
        # Hai request dong thoi van tra cung mot bookmark thay vi loi trung khoa.
        await db.rollback()

    return await get_bookmark(db, user_id=user_id, image_id=image_id)


async def remove_bookmark(
    db: AsyncSession,
    *,
    user_id: int,
    image_id: int,
) -> bool:
    bookmark = await db.scalar(
        select(Bookmark).where(
            Bookmark.user_id == user_id,
            Bookmark.image_id == image_id,
        )
    )
    if bookmark is None:
        return False

    await db.delete(bookmark)
    await db.commit()
    return True


def _bookmark_rows_query(*, user_id: int, image_id: int | None = None):
    query = (
        select(Bookmark, Image, OCRText)
        .join(Image, Image.id == Bookmark.image_id)
        .outerjoin(OCRText, OCRText.image_id == Image.id)
        .where(Bookmark.user_id == user_id)
    )
    if image_id is not None:
        query = query.where(Bookmark.image_id == image_id)
    return query


def _build_bookmark_item(
    bookmark: Bookmark,
    image: Image,
    ocr_text: OCRText | None,
) -> BookmarkItem:
    image_url = build_image_url(image.storage_path)
    source_type = (
        image.source_type.value
        if hasattr(image.source_type, "value")
        else str(image.source_type)
    )
    return BookmarkItem(
        id=bookmark.id,
        image_id=image.id,
        thumbnail_url=image_url,
        image_url=image_url,
        saved_at=bookmark.created_at,
        metadata=BookmarkMetadata(
            width=image.width,
            height=image.height,
            source=source_type,
            ocr_text=ocr_text.raw_text if ocr_text else None,
        ),
    )
