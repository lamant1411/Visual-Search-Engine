"""Service xóa m?m, khôi ph?c và xóa vinh vi?n ?nh trong kho ?nh."""

from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path

from fastapi import status
from sqlalchemy import delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import api_error
from app.models.bookmark import Bookmark
from app.models.image import Image
from app.models.image_embedding import ImageEmbedding
from app.models.indexing_batch import IndexingBatch
from app.models.indexing_item import IndexingItem
from app.models.ocr_text import OCRText
from app.schemas.common import BatchStatus, ImageStatus, IndexingItemStatus, UserRole
from app.services.qdrant_service import QdrantSearchService


@dataclass(frozen=True)
class ImageDeleteResult:
    image_id: int
    deleted: bool
    file_deleted: bool
    qdrant_deleted: bool


@dataclass(frozen=True)
class ImageRestoreResult:
    image_id: int
    restored: bool
    status: ImageStatus


async def delete_image_from_library(
    db: AsyncSession,
    *,
    image_id: int,
    requester_id: int,
    requester_role: UserRole | str,
) -> ImageDeleteResult:
    """Xóa m?m ?nh d? ?nh bi?n m?t kh?i search/kho ?nh nhung v?n có th? khôi ph?c."""
    image = await _get_mutable_image(
        db,
        image_id=image_id,
        requester_id=requester_id,
        requester_role=requester_role,
        action="delete",
    )
    await _ensure_image_not_active_in_indexing(db, image_id)

    if image.status == ImageStatus.deleted:
        return ImageDeleteResult(image_id=image_id, deleted=True, file_deleted=False, qdrant_deleted=False)

    image.status_before_delete = _status_value(image.status)
    image.status = ImageStatus.deleted
    image.deleted_at = datetime.now(timezone.utc)
    image.deleted_by_user_id = requester_id
    await db.commit()

    return ImageDeleteResult(image_id=image_id, deleted=True, file_deleted=False, qdrant_deleted=False)


async def restore_deleted_image(
    db: AsyncSession,
    *,
    image_id: int,
    requester_id: int,
    requester_role: UserRole | str,
) -> ImageRestoreResult:
    """Khôi ph?c ?nh dã xóa m?m v? tr?ng thái tru?c khi xóa."""
    image = await _get_mutable_image(
        db,
        image_id=image_id,
        requester_id=requester_id,
        requester_role=requester_role,
        action="restore",
    )
    if image.status != ImageStatus.deleted:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "IMAGE_NOT_DELETED",
            "Only deleted images can be restored.",
            {"image_id": image_id, "status": image.status},
        )

    restored_status = _restore_status(image.status_before_delete)
    image.status = restored_status
    image.deleted_at = None
    image.deleted_by_user_id = None
    image.status_before_delete = None
    await db.commit()

    return ImageRestoreResult(image_id=image_id, restored=True, status=restored_status)


async def permanently_delete_image_from_library(
    db: AsyncSession,
    *,
    image_id: int,
    requester_id: int,
    requester_role: UserRole | str,
) -> ImageDeleteResult:
    """Xóa vinh vi?n ?nh dã b? xóa m?m kh?i DB, Qdrant và file local."""
    image = await _get_mutable_image(
        db,
        image_id=image_id,
        requester_id=requester_id,
        requester_role=requester_role,
        action="permanently delete",
    )
    if image.status != ImageStatus.deleted:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "IMAGE_NOT_DELETED",
            "Only deleted images can be permanently deleted.",
            {"image_id": image_id, "status": image.status},
        )
    await _ensure_image_not_active_in_indexing(db, image_id)

    storage_path = image.storage_path
    affected_batch_ids = list(
        await db.scalars(
            select(IndexingItem.batch_id).where(IndexingItem.image_id == image_id).distinct()
        )
    )
    embedding = await db.get(ImageEmbedding, image_id)
    qdrant_deleted = _delete_qdrant_vector(embedding.qdrant_point_id if embedding else None, image_id)

    await db.execute(delete(Bookmark).where(Bookmark.image_id == image_id))
    await db.execute(delete(OCRText).where(OCRText.image_id == image_id))
    await db.execute(delete(ImageEmbedding).where(ImageEmbedding.image_id == image_id))
    await db.execute(delete(IndexingItem).where(IndexingItem.image_id == image_id))
    await db.delete(image)
    await _refresh_batches_after_image_delete(db, affected_batch_ids)
    await db.commit()

    file_deleted = _delete_local_image_file(storage_path)
    return ImageDeleteResult(
        image_id=image_id,
        deleted=True,
        file_deleted=file_deleted,
        qdrant_deleted=qdrant_deleted,
    )


async def _get_mutable_image(
    db: AsyncSession,
    *,
    image_id: int,
    requester_id: int,
    requester_role: UserRole | str,
    action: str,
) -> Image:
    image = await db.get(Image, image_id)
    if image is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "IMAGE_NOT_FOUND",
            "Image not found.",
            {"image_id": image_id},
        )

    owns_image = image.owner_user_id == requester_id
    deleted_by_user = image.deleted_by_user_id == requester_id
    if not owns_image and not deleted_by_user:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "FORBIDDEN",
            f"You can only {action} images that you own.",
            {"image_id": image_id},
        )
    return image


async def _ensure_image_not_active_in_indexing(db: AsyncSession, image_id: int) -> None:
    active_item_id = await db.scalar(
        select(IndexingItem.id)
        .where(
            IndexingItem.image_id == image_id,
            IndexingItem.status.in_([IndexingItemStatus.queued, IndexingItemStatus.running]),
        )
        .limit(1)
    )
    if active_item_id is not None:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "IMAGE_INDEXING_ACTIVE",
            "Cannot delete an image while it is queued or running in an indexing batch.",
            {"image_id": image_id, "item_id": active_item_id},
        )


async def _refresh_batches_after_image_delete(db: AsyncSession, batch_ids: list[str]) -> None:
    for batch_id in batch_ids:
        batch = await db.scalar(select(IndexingBatch).where(IndexingBatch.batch_id == batch_id))
        if batch is None:
            continue

        total = await _count_rows(
            db,
            select(func.count()).select_from(IndexingItem).where(IndexingItem.batch_id == batch_id),
        )
        indexed = await _count_rows(
            db,
            select(func.count()).select_from(IndexingItem).where(
                IndexingItem.batch_id == batch_id,
                IndexingItem.status == IndexingItemStatus.indexed,
            ),
        )
        failed = await _count_rows(
            db,
            select(func.count()).select_from(IndexingItem).where(
                IndexingItem.batch_id == batch_id,
                IndexingItem.status == IndexingItemStatus.failed,
            ),
        )
        active = await _count_rows(
            db,
            select(func.count()).select_from(IndexingItem).where(
                IndexingItem.batch_id == batch_id,
                IndexingItem.status.in_([IndexingItemStatus.queued, IndexingItemStatus.running]),
            ),
        )

        batch.total_images = total
        batch.processed_images = indexed
        batch.failed_images = failed
        if total == 0:
            batch.status = BatchStatus.completed
            batch.error_message = None
        elif active > 0 or batch.is_uploading:
            batch.status = BatchStatus.running
        else:
            batch.status = BatchStatus.completed


async def _count_rows(db: AsyncSession, statement) -> int:
    value = await db.scalar(statement)
    return int(value or 0)


def _delete_qdrant_vector(point_id: str | None, image_id: int) -> bool:
    try:
        return QdrantSearchService().delete_image_vector(point_id=point_id, image_id=image_id)
    except Exception:
        # N?u Qdrant l?i, v?n xóa DB/file d? ?nh không còn t?n t?i trong h? th?ng.
        return False


def _delete_local_image_file(storage_path: str) -> bool:
    try:
        file_path = _storage_path_to_backend_path(storage_path)
    except Exception:
        return False

    if not file_path.is_file():
        return False

    try:
        file_path.unlink()
        return True
    except OSError:
        return False


def _storage_path_to_backend_path(storage_path: str) -> Path:
    normalized = storage_path.replace("\\", "/")
    if normalized.startswith("/static/"):
        relative_path = normalized.removeprefix("/static/")
    elif normalized.startswith("static/"):
        relative_path = normalized.removeprefix("static/")
    else:
        raise ValueError("Only local /static images can be deleted.")

    static_root = Path(settings.static_files_dir).resolve()
    target_path = (static_root / relative_path).resolve()
    if target_path != static_root and static_root not in target_path.parents:
        raise ValueError("Resolved image path is outside the static directory.")
    return target_path


def _restore_status(status_before_delete: str | None) -> ImageStatus:
    if not status_before_delete or status_before_delete == ImageStatus.deleted.value:
        return ImageStatus.indexed
    try:
        return ImageStatus(status_before_delete)
    except ValueError:
        return ImageStatus.indexed


def _status_value(value: ImageStatus | str) -> str:
    return value.value if hasattr(value, "value") else str(value)