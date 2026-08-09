"""Album API cho kho anh cua nguoi dung."""

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import delete, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.errors import api_error
from app.db.session import get_db
from app.models.album import Album, AlbumImage
from app.models.image import Image
from app.models.ocr_text import OCRText
from app.models.user import User
from app.schemas.album import (
    AlbumCreate,
    AlbumDeleteResponse,
    AlbumFailedImageItem,
    AlbumImageBulkRequest,
    AlbumImageChangeResponse,
    AlbumImageItem,
    AlbumImageListResponse,
    AlbumListResponse,
    AlbumOut,
    AlbumUpdate,
)
from app.schemas.common import ImageStatus
from app.services.search import build_image_url, image_visible_to_user

router = APIRouter()


@router.get(
    "",
    response_model=AlbumListResponse,
    summary="List albums",
    description="Return paginated albums owned by the current authenticated user. Soft-deleted albums are hidden.",
    responses={200: {"description": "Albums returned successfully."}, 401: {"description": "Missing, invalid, or expired token."}},
)
async def list_albums(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlbumListResponse:
    filters = [Album.owner_user_id == current_user.id, Album.deleted_at.is_(None)]
    total = int(await db.scalar(select(func.count()).select_from(Album).where(*filters)) or 0)
    rows = (
        await db.scalars(
            select(Album)
            .where(*filters)
            .order_by(Album.updated_at.desc(), Album.created_at.desc(), Album.id.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return AlbumListResponse(items=[await _to_album_out(db, album, current_user.id) for album in rows], page=page, limit=limit, total=total)


@router.post(
    "",
    response_model=AlbumOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create album",
    description="Create a new album owned by the current authenticated user.",
    responses={201: {"description": "Album created successfully."}, 400: {"description": "Invalid cover image."}, 401: {"description": "Missing, invalid, or expired token."}},
)
async def create_album(
    payload: AlbumCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlbumOut:
    if payload.cover_image_id is not None:
        await _get_visible_active_image(db, payload.cover_image_id, current_user.id)

    album = Album(
        owner_user_id=current_user.id,
        name=payload.name.strip(),
        description=payload.description.strip() if payload.description else None,
        cover_image_id=payload.cover_image_id,
    )
    db.add(album)
    await db.commit()
    await db.refresh(album)
    return await _to_album_out(db, album, current_user.id)


@router.get(
    "/{album_id}",
    response_model=AlbumOut,
    summary="Get album detail",
    description="Return one album owned by the current authenticated user.",
    responses={200: {"description": "Album returned successfully."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Album not found."}},
)
async def get_album(
    album_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlbumOut:
    album = await _get_owned_album(db, album_id, current_user.id)
    return await _to_album_out(db, album, current_user.id)


@router.patch(
    "/{album_id}",
    response_model=AlbumOut,
    summary="Update album",
    description="Update album name, description, or cover image. The album must belong to the current user.",
    responses={200: {"description": "Album updated successfully."}, 400: {"description": "Invalid cover image."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Album not found."}},
)
async def update_album(
    album_id: int,
    payload: AlbumUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlbumOut:
    album = await _get_owned_album(db, album_id, current_user.id)

    update_fields = payload.model_fields_set
    if "name" in update_fields and payload.name is not None:
        album.name = payload.name.strip()
    if "description" in update_fields:
        album.description = payload.description.strip() if payload.description else None
    if "cover_image_id" in update_fields:
        if payload.cover_image_id is not None:
            await _get_visible_active_image(db, payload.cover_image_id, current_user.id)
        album.cover_image_id = payload.cover_image_id

    await db.commit()
    await db.refresh(album)
    return await _to_album_out(db, album, current_user.id)


@router.delete(
    "/{album_id}",
    response_model=AlbumDeleteResponse,
    summary="Soft delete album",
    description="Soft delete an album owned by the current user. Images are not deleted.",
    responses={200: {"description": "Album soft-deleted successfully."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Album not found."}},
)
async def delete_album(
    album_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlbumDeleteResponse:
    album = await _get_owned_album(db, album_id, current_user.id)
    album.deleted_at = datetime.now(timezone.utc)
    await db.commit()
    return AlbumDeleteResponse(album_id=album.id, deleted=True)


@router.get(
    "/{album_id}/images",
    response_model=AlbumImageListResponse,
    summary="List album images",
    description="Return active images in a user-owned album. Soft-deleted images are hidden but their album links are preserved for restore.",
    responses={200: {"description": "Album images returned successfully."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Album not found."}},
)
async def list_album_images(
    album_id: int,
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlbumImageListResponse:
    await _get_owned_album(db, album_id, current_user.id)
    filters = [
        AlbumImage.album_id == album_id,
        Image.status != ImageStatus.deleted,
        image_visible_to_user(current_user.id),
    ]
    total = int(
        await db.scalar(
            select(func.count())
            .select_from(AlbumImage)
            .join(Image, Image.id == AlbumImage.image_id)
            .outerjoin(OCRText, OCRText.image_id == Image.id)
            .where(*filters)
        )
        or 0
    )
    rows = (
        await db.execute(
            select(AlbumImage, Image, OCRText)
            .join(Image, Image.id == AlbumImage.image_id)
            .outerjoin(OCRText, OCRText.image_id == Image.id)
            .where(*filters)
            .order_by(AlbumImage.added_at.desc(), AlbumImage.image_id.desc())
            .offset((page - 1) * limit)
            .limit(limit)
        )
    ).all()
    return AlbumImageListResponse(
        items=[_to_album_image_item(link, image, ocr_text) for link, image, ocr_text in rows],
        page=page,
        limit=limit,
        total=total,
    )


@router.post(
    "/{album_id}/images/bulk-add",
    response_model=AlbumImageChangeResponse,
    summary="Add images to album",
    description="Add multiple visible active images to a user-owned album. Duplicate images are skipped as successful no-ops.",
    responses={200: {"description": "Images added to album."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Album not found."}},
)
async def bulk_add_images_to_album(
    album_id: int,
    payload: AlbumImageBulkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlbumImageChangeResponse:
    album = await _get_owned_album(db, album_id, current_user.id)
    added_ids: list[int] = []
    failed_items: list[AlbumFailedImageItem] = []
    seen_ids: set[int] = set()

    for image_id in payload.image_ids:
        if image_id in seen_ids:
            continue
        seen_ids.add(image_id)
        try:
            await _get_visible_active_image(db, image_id, current_user.id)
            existing = await db.get(AlbumImage, {"album_id": album.id, "image_id": image_id})
            if existing is None:
                db.add(AlbumImage(album_id=album.id, image_id=image_id))
                added_ids.append(image_id)
        except Exception as exc:
            failed_items.append(_to_failed_item(image_id, exc))

    album.updated_at = datetime.now(timezone.utc)
    try:
        await db.commit()
    except IntegrityError:
        await db.rollback()

    return AlbumImageChangeResponse(
        album_id=album.id,
        added_image_ids=added_ids,
        failed_items=failed_items,
        added_count=len(added_ids),
        failed_count=len(failed_items),
    )


@router.post(
    "/{album_id}/images/bulk-remove",
    response_model=AlbumImageChangeResponse,
    summary="Remove images from album",
    description="Remove multiple images from a user-owned album. Images themselves are not deleted.",
    responses={200: {"description": "Images removed from album."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Album not found."}},
)
async def bulk_remove_images_from_album(
    album_id: int,
    payload: AlbumImageBulkRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlbumImageChangeResponse:
    album = await _get_owned_album(db, album_id, current_user.id)
    unique_ids = list(dict.fromkeys(payload.image_ids))
    existing_ids = set(
        await db.scalars(
            select(AlbumImage.image_id).where(
                AlbumImage.album_id == album.id,
                AlbumImage.image_id.in_(unique_ids),
            )
        )
    )
    await db.execute(
        delete(AlbumImage).where(
            AlbumImage.album_id == album.id,
            AlbumImage.image_id.in_(unique_ids),
        )
    )
    album.updated_at = datetime.now(timezone.utc)
    await db.commit()
    removed_ids = [image_id for image_id in unique_ids if image_id in existing_ids]
    return AlbumImageChangeResponse(
        album_id=album.id,
        removed_image_ids=removed_ids,
        removed_count=len(removed_ids),
    )


@router.delete(
    "/{album_id}/images/{image_id}",
    response_model=AlbumImageChangeResponse,
    summary="Remove image from album",
    description="Remove one image from a user-owned album. The image itself is not deleted.",
    responses={200: {"description": "Image removed from album."}, 401: {"description": "Missing, invalid, or expired token."}, 404: {"description": "Album not found."}},
)
async def remove_image_from_album(
    album_id: int,
    image_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AlbumImageChangeResponse:
    return await bulk_remove_images_from_album(
        album_id,
        AlbumImageBulkRequest(image_ids=[image_id]),
        current_user,
        db,
    )


async def _get_owned_album(db: AsyncSession, album_id: int, owner_user_id: int) -> Album:
    album = await db.scalar(
        select(Album).where(
            Album.id == album_id,
            Album.owner_user_id == owner_user_id,
            Album.deleted_at.is_(None),
        )
    )
    if album is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "ALBUM_NOT_FOUND", "Album not found.", {"album_id": album_id})
    return album


async def _get_visible_active_image(db: AsyncSession, image_id: int, owner_user_id: int) -> Image:
    image = await db.scalar(
        select(Image).where(
            Image.id == image_id,
            Image.status != ImageStatus.deleted,
            image_visible_to_user(owner_user_id),
        )
    )
    if image is None:
        raise api_error(status.HTTP_404_NOT_FOUND, "IMAGE_NOT_FOUND", "Image not found or has been deleted.", {"image_id": image_id})
    return image


async def _to_album_out(db: AsyncSession, album: Album, owner_user_id: int) -> AlbumOut:
    image_count = int(
        await db.scalar(
            select(func.count())
            .select_from(AlbumImage)
            .join(Image, Image.id == AlbumImage.image_id)
            .where(
                AlbumImage.album_id == album.id,
                Image.status != ImageStatus.deleted,
                image_visible_to_user(owner_user_id),
            )
        )
        or 0
    )
    cover_image_url = None
    if album.cover_image_id is not None:
        cover = await db.scalar(
            select(Image).where(
                Image.id == album.cover_image_id,
                Image.status != ImageStatus.deleted,
                image_visible_to_user(owner_user_id),
            )
        )
        if cover is not None:
            cover_image_url = build_image_url(cover.storage_path)

    return AlbumOut(
        id=album.id,
        name=album.name,
        description=album.description,
        cover_image_id=album.cover_image_id if cover_image_url else None,
        cover_image_url=cover_image_url,
        image_count=image_count,
        created_at=album.created_at,
        updated_at=album.updated_at,
    )


def _to_album_image_item(link: AlbumImage, image: Image, ocr_text: OCRText | None = None) -> AlbumImageItem:
    image_url = build_image_url(image.storage_path)
    return AlbumImageItem(
        id=image.id,
        thumbnail_url=image_url,
        image_url=image_url,
        original_filename=image.original_filename,
        status=image.status,
        source_type=image.source_type,
        width=image.width,
        height=image.height,
        added_at=link.added_at,
    )


def _to_failed_item(image_id: int, exc: Exception) -> AlbumFailedImageItem:
    detail = getattr(exc, "detail", None)
    if isinstance(detail, dict):
        return AlbumFailedImageItem(
            image_id=image_id,
            code=str(detail.get("code") or "ERROR"),
            message=str(detail.get("message") or "Unable to add image to album."),
        )
    return AlbumFailedImageItem(image_id=image_id, code="ERROR", message=str(exc))
