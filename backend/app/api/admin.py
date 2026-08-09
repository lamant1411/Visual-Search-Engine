"""Admin APIs for dashboard and batch indexing."""

import hashlib
import uuid
from io import BytesIO
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import unquote, urlparse

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile, status
from PIL import Image as PILImage, ImageOps, UnidentifiedImageError
from sqlalchemy import case, delete, func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_admin
from app.core.config import settings
from app.core.errors import api_error
from app.db.session import get_db
from app.models.bookmark import Bookmark
from app.models.image import Image
from app.models.image_embedding import ImageEmbedding
from app.models.indexing_item import IndexingItem
from app.models.indexing_batch import IndexingBatch
from app.models.ocr_text import OCRText
from app.models.user import User
from app.schemas.admin import (
    AdminBatchCompleteUploadResponse,
    AdminBatchCreateResponse,
    AdminBatchImageUploadResponse,
    AdminDashboardResponse,
    AdminImageDeleteResponse,
    AdminImageListResponse,
    AdminImageOut,
    AdminIndexBatchListResponse,
    AdminIndexStartResponse,
    AdminIndexStatusResponse,
    AdminIndexRetryItemsRequest,
    AdminIndexRetryItemsResponse,
    AdminIndexingItemListResponse,
    AdminIndexingItemOut,
    AdminIndexUploadResponse,
    AdminUserListResponse,
)
from app.schemas.common import BatchStatus, ImageSourceType, ImageStatus, IndexingItemStatus
from app.services.admin_indexing import AIIndexingServiceError, AIIndexItemPayload, AIIndexItemsResponse, ai_indexing_client
from app.services.image_deletion import delete_image_from_library
from app.services.qdrant_service import QdrantSearchService
from app.services.search import build_image_url

router = APIRouter()
indexing_router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@router.get(
    "/dashboard",
    response_model=AdminDashboardResponse,
    summary="Get admin dashboard stats",
    description="Return aggregate image/user counts and latest indexing batches. Requires admin role. Does not expose private image URLs.",
    responses={
        200: {"description": "Dashboard stats returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
    },
)
async def get_dashboard(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminDashboardResponse:
    """Return admin dashboard summary metrics."""
    total_images = await _count_rows(
        db,
        select(func.count()).select_from(Image).where(Image.status != ImageStatus.deleted),
    )
    indexed_images = await _count_rows(
        db, select(func.count()).select_from(Image).where(Image.status == ImageStatus.indexed)
    )
    dataset_indexed_images = await _count_rows(
        db,
        select(func.count()).select_from(Image).where(
            Image.status == ImageStatus.indexed,
            Image.source_type == ImageSourceType.dataset,
        ),
    )
    upload_indexed_images = await _count_rows(
        db,
        select(func.count()).select_from(Image).where(
            Image.status == ImageStatus.indexed,
            Image.source_type == ImageSourceType.upload,
        ),
    )
    pending_images = await _count_rows(
        db, select(func.count()).select_from(Image).where(Image.status == ImageStatus.pending)
    )
    failed_images = await _count_rows(
        db, select(func.count()).select_from(Image).where(Image.status == ImageStatus.failed)
    )
    total_users = await _count_rows(db, select(func.count()).select_from(User))
    latest_batches = (
        await db.scalars(
            select(IndexingBatch).order_by(IndexingBatch.created_at.desc()).limit(5)
        )
    ).all()

    for batch in latest_batches:
        await _sync_batch_if_active(db, batch)

    return AdminDashboardResponse(
        total_images=total_images,
        indexed_images=indexed_images,
        dataset_indexed_images=dataset_indexed_images,
        upload_indexed_images=upload_indexed_images,
        pending_images=pending_images,
        failed_images=failed_images,
        total_users=total_users,
        latest_batches=list(latest_batches),
    )


@router.get(
    "/users",
    response_model=AdminUserListResponse,
    summary="List users",
    description="Return a paginated user list for admin review. Currently read-only. Requires admin role.",
    responses={
        200: {"description": "Users returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
    },
)
async def list_users(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminUserListResponse:
    """Tra danh sach user cho admin xem, chi ho tro doc."""
    total = await _count_rows(db, select(func.count()).select_from(User))
    offset = (page - 1) * limit
    users = (
        await db.scalars(
            select(User).order_by(User.created_at.desc(), User.id.desc()).offset(offset).limit(limit)
        )
    ).all()
    return AdminUserListResponse(
        items=list(users),
        page=page,
        limit=limit,
        total=total,
    )


@router.get(
    "/images",
    response_model=AdminImageListResponse,
    summary="List stored images",
    description="Return paginated images owned by the current admin account. This endpoint is for admin workspace image management and does not expose private images owned by other users.",
    responses={
        200: {"description": "Images returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
    },
)
async def list_images(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    image_status: ImageStatus | None = Query(None, alias="status"),
    q: str | None = Query(None, min_length=1, max_length=255),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminImageListResponse:
    """Tra danh sach anh trong kho de admin quan ly."""
    filters = [Image.owner_user_id == current_user.id]
    if image_status is not None:
        filters.append(Image.status == image_status)
    if q:
        keyword = f"%{q.strip()}%"
        filters.append(or_(Image.original_filename.ilike(keyword), Image.storage_path.ilike(keyword)))

    total = await _count_rows(db, select(func.count()).select_from(Image).where(*filters))
    offset = (page - 1) * limit
    images = (
        await db.scalars(
            select(Image)
            .where(*filters)
            .order_by(Image.created_at.desc(), Image.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()

    return AdminImageListResponse(
        items=[_to_admin_image_out(image) for image in images],
        page=page,
        limit=limit,
        total=total,
    )


@router.delete(
    "/images/{image_id}",
    response_model=AdminImageDeleteResponse,
    summary="Soft delete stored image",
    description="Soft delete an image owned by the current admin account. This endpoint does not allow deleting private images owned by other users.",
    responses={
        200: {"description": "Image soft-deleted successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
        404: {"description": "Image not found."},
        409: {"description": "Image is currently queued or running in an indexing batch."},
    },
)
async def delete_image(
    image_id: int,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminImageDeleteResponse:
    """Soft delete an image so it can be restored later."""
    result = await delete_image_from_library(
        db,
        image_id=image_id,
        requester_id=current_user.id,
        requester_role=current_user.role,
    )
    return AdminImageDeleteResponse(
        image_id=result.image_id,
        deleted=result.deleted,
        file_deleted=result.file_deleted,
        qdrant_deleted=result.qdrant_deleted,
    )


@router.post(
    "/index/batches",
    response_model=AdminBatchCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create indexing batch",
    description="Create an empty user-owned indexing batch so the frontend can upload images in chunks. After creating a batch, call /index/batches/{batch_id}/images. Requires authentication; regular users and admins can create batches for their own image library.",
    responses={
        201: {"description": "Batch created successfully."},
        401: {"description": "Missing, invalid, or expired token."},
    },
    include_in_schema=False,
)
async def create_indexing_batch(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminBatchCreateResponse:
    """Tao batch rong de FE upload anh theo tung chunk."""
    batch = IndexingBatch(
        batch_id=f"idx_{uuid.uuid4().hex[:12]}",
        owner_user_id=current_user.id,
        status=BatchStatus.queued,
        total_images=0,
        processed_images=0,
        failed_images=0,
        ocr_processed_images=0,
        ocr_failed_images=0,
        is_uploading=True,
        upload_started_at=datetime.now(timezone.utc),
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)
    return AdminBatchCreateResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_images=batch.total_images,
        processed_images=batch.processed_images,
        failed_images=batch.failed_images,
        ocr_processed_images=batch.ocr_processed_images,
        ocr_failed_images=batch.ocr_failed_images,
        is_uploading=batch.is_uploading,
        upload_started_at=batch.upload_started_at,
    )


@router.post(
    "/index/batches/{batch_id}/images",
    response_model=AdminBatchImageUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload images to batch and enqueue indexing",
    description=(
        "Receive multipart/form-data field files. Optional image_urls can be sent with the same length as files to replace failed images in this batch. Each new image is limited by ADMIN_INDEX_UPLOAD_MAX_MB, and each upload request/chunk is limited by ADMIN_INDEX_BATCH_MAX_MB. Clients can upload multiple chunks to the same batch. Saved images are owned by the current user and sent to the AI queue for item-level indexing."
    ),
    responses={
        201: {"description": "Upload succeeded and items were enqueued to AI."},
        400: {"description": "Missing file or unsupported file type. Only JPG, PNG, and WebP are supported."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "Authenticated user cannot access this batch or resource."},
        404: {"description": "Batch not found."},
        409: {"description": "Batch is closed and cannot accept more uploads."},
        413: {"description": "File or upload chunk size exceeds the allowed limit."},
        503: {"description": "AI indexing service is unavailable."},
    },
    include_in_schema=False,
)
async def upload_images_to_batch(
    batch_id: str,
    files: list[UploadFile] = File(...),
    image_urls: list[str] | None = Form(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminBatchImageUploadResponse:
    """Upload anh moi hoac upload lai file thay the cho anh failed trong cung batch."""
    batch = await _get_owned_batch(db, batch_id=batch_id, owner_user_id=current_user.id)
    if batch is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            "Indexing batch not found.",
            {"batch_id": batch_id},
        )
    if not files:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "At least one image file is required.",
            {"field": "files"},
        )

    normalized_image_urls = _normalize_optional_image_urls(image_urls, len(files))
    is_retry_only = bool(normalized_image_urls) and all(normalized_image_urls)
    if batch.status == BatchStatus.cancelled or (batch.status in {BatchStatus.completed, BatchStatus.failed} and not is_retry_only):
        raise api_error(
            status.HTTP_409_CONFLICT,
            "INDEXING_BATCH_CLOSED",
            "Cannot upload new images to a closed batch. Only failed-image replacements are allowed.",
            {"batch_id": batch_id, "status": batch.status},
        )

    upload_dir = Path(settings.admin_index_upload_dir) / batch_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    queued_items: list[AIIndexItemPayload] = []
    saved_new_paths: list[Path] = []
    new_item_count = 0
    skipped_files = 0
    uploaded_bytes = 0
    max_batch_bytes = settings.admin_index_batch_max_mb * 1024 * 1024

    try:
        prepared_uploads: list[dict[str, object]] = []
        duplicate_candidate_checksums: set[str] = set()
        for index, file in enumerate(files):
            original_content = await _read_and_validate_upload_file(file)
            optimized_content, optimized_mime_type, optimized_width, optimized_height = _optimize_uploaded_image(
                file,
                original_content,
            )
            retry_image_url = normalized_image_urls[index] if normalized_image_urls else None
            checksum = hashlib.sha256(optimized_content).hexdigest()
            raw_checksum = hashlib.sha256(original_content).hexdigest()

            prepared_uploads.append(
                {
                    "file": file,
                    "retry_image_url": retry_image_url,
                    "content": optimized_content,
                    "mime_type": optimized_mime_type,
                    "width": optimized_width,
                    "height": optimized_height,
                    "checksum": checksum,
                    "raw_checksum": raw_checksum,
                }
            )
            if not retry_image_url:
                duplicate_candidate_checksums.add(raw_checksum)
                duplicate_candidate_checksums.add(checksum)

        existing_duplicate_checksums = await _get_duplicate_upload_checksums(
            db,
            duplicate_candidate_checksums,
            owner_user_id=current_user.id,
        )
        accepted_checksums: set[str] = set()

        for prepared in prepared_uploads:
            file = prepared["file"]
            retry_image_url = prepared["retry_image_url"]
            optimized_content = prepared["content"]
            optimized_mime_type = prepared["mime_type"]
            optimized_width = prepared["width"]
            optimized_height = prepared["height"]
            checksum = prepared["checksum"]
            raw_checksum = prepared["raw_checksum"]

            if retry_image_url:
                image, item = await _prepare_failed_replacement_item(
                    db=db,
                    batch_id=batch_id,
                    owner_user_id=current_user.id,
                    image_url=str(retry_image_url),
                    file=file,
                    content=optimized_content,
                    mime_type=optimized_mime_type,
                    width=optimized_width,
                    height=optimized_height,
                    checksum=checksum,
                )
                queued_items.append(_build_ai_item_payload(item, image))
                continue

            if raw_checksum in existing_duplicate_checksums or checksum in existing_duplicate_checksums:
                skipped_files += 1
                continue
            if raw_checksum in accepted_checksums or checksum in accepted_checksums:
                skipped_files += 1
                continue

            uploaded_bytes += len(optimized_content)
            if uploaded_bytes > max_batch_bytes:
                raise api_error(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    "PAYLOAD_TOO_LARGE",
                    f"Each upload chunk must be <= {settings.admin_index_batch_max_mb}MB.",
                    {
                        "field": "files",
                        "maxBatchMb": settings.admin_index_batch_max_mb,
                        "currentBatchBytes": uploaded_bytes,
                    },
                )

            filename = _safe_filename(file.filename or f"image_{len(queued_items) + 1}.jpg")
            target = _dedupe_path(upload_dir / filename)
            target.write_bytes(optimized_content)
            saved_new_paths.append(target)
            storage_path = f"/static/images/admin_uploads/{batch_id}/{target.name}"

            image = Image(
                source_type=ImageSourceType.upload,
                storage_path=storage_path,
                original_filename=file.filename or target.name,
                mime_type=optimized_mime_type,
                file_size=len(optimized_content),
                width=optimized_width,
                height=optimized_height,
                checksum=checksum,
                status=ImageStatus.pending,
                owner_user_id=current_user.id,
            )
            db.add(image)
            await db.flush()

            item = IndexingItem(
                batch_id=batch_id,
                image_id=image.id,
                status=IndexingItemStatus.queued,
            )
            db.add(item)
            await db.flush()
            new_item_count += 1
            accepted_checksums.add(raw_checksum)
            accepted_checksums.add(checksum)

            queued_items.append(
                AIIndexItemPayload(
                    item_id=item.id,
                    image_id=image.id,
                    image_path=f"/app/{settings.admin_index_upload_dir}/{batch_id}/{target.name}",
                    storage_path=storage_path,
                    original_filename=image.original_filename,
                    owner_user_id=image.owner_user_id,
                )
            )

        batch.status = BatchStatus.running
        batch.is_uploading = True
        batch.total_images += new_item_count
        await db.commit()
    except Exception:
        await db.rollback()
        for uploaded_file in saved_new_paths:
            if uploaded_file.is_file():
                uploaded_file.unlink(missing_ok=True)
        raise

    try:
        if queued_items:
            ai_response = await ai_indexing_client.enqueue_indexing_items(
                batch_id=batch_id,
                items=queued_items,
            )
        else:
            ai_response = AIIndexItemsResponse(batch_id=batch_id, queued_items=0)
    except AIIndexingServiceError as exc:
        await _mark_uploaded_items_failed(db, [item.item_id for item in queued_items], str(exc))
        await _sync_batch_counts(db, batch)
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI_INDEXING_SERVICE_UNAVAILABLE",
            str(exc),
        ) from exc

    return AdminBatchImageUploadResponse(
        batch_id=batch_id,
        uploaded_files=len(queued_items),
        total_images=batch.total_images,
        queued_items=ai_response.queued_items,
        skipped_files=skipped_files,
    )


@router.post(
    "/index/batches/{batch_id}/complete-upload",
    response_model=AdminBatchCompleteUploadResponse,
    summary="Complete batch upload",
    description="Mark a user-owned batch upload as complete after all upload chunks are finished. Indexing continues for queued/running items. Requires authentication and ownership of the batch.",
    responses={
        200: {"description": "Batch upload marked as complete."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "Authenticated user cannot access this batch or resource."},
        404: {"description": "Batch not found."},
    },
    include_in_schema=False,
)
async def complete_batch_upload(
    batch_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminBatchCompleteUploadResponse:
    """Danh dau FE da upload xong batch. Indexing van tiep tuc neu con item queued/running."""
    batch = await _get_owned_batch(db, batch_id=batch_id, owner_user_id=current_user.id)
    if batch is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            "Indexing batch not found.",
            {"batch_id": batch_id},
        )
    batch.is_uploading = False
    batch.upload_completed_at = batch.upload_completed_at or datetime.now(timezone.utc)
    await db.commit()
    await _sync_batch_counts(db, batch)
    return AdminBatchCompleteUploadResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_images=batch.total_images,
        is_uploading=batch.is_uploading,
    )


@router.post(
    "/index/batches/{batch_id}/cancel",
    response_model=AdminIndexStatusResponse,
    summary="Cancel indexing batch",
    description="Cancel queued/running items in a user-owned batch. Other batches are not affected. Requires authentication and ownership of the batch.",
    responses={
        200: {"description": "Batch cancelled successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "Authenticated user cannot access this batch or resource."},
        404: {"description": "Batch not found."},
    },
    include_in_schema=False,
)
async def cancel_indexing_batch(
    batch_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexStatusResponse:
    """Cancel queued/running items without stopping other indexing batches."""
    batch = await _get_owned_batch(db, batch_id=batch_id, owner_user_id=current_user.id)
    if batch is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            "Indexing batch not found.",
            {"batch_id": batch_id},
        )

    if batch.status not in {BatchStatus.completed, BatchStatus.failed, BatchStatus.cancelled}:
        active_items = (
            await db.scalars(
                select(IndexingItem).where(
                    IndexingItem.batch_id == batch_id,
                    IndexingItem.status.in_(
                        [IndexingItemStatus.queued, IndexingItemStatus.running]
                    ),
                )
            )
        ).all()
        for item in active_items:
            item.status = IndexingItemStatus.cancelled
            item.error_message = "Cancelled by admin."
            item.ocr_status = IndexingItemStatus.cancelled
            item.ocr_error_message = "Cancelled by admin."
            item.ocr_completed_at = datetime.now(timezone.utc)

        active_ocr_items = (
            await db.scalars(
                select(IndexingItem).where(
                    IndexingItem.batch_id == batch_id,
                    IndexingItem.status == IndexingItemStatus.indexed,
                    IndexingItem.ocr_status.in_(
                        [IndexingItemStatus.queued, IndexingItemStatus.running]
                    ),
                )
            )
        ).all()
        for item in active_ocr_items:
            item.ocr_status = IndexingItemStatus.cancelled
            item.ocr_error_message = "Cancelled by admin."
            item.ocr_completed_at = datetime.now(timezone.utc)

        batch.status = BatchStatus.cancelled
        batch.is_uploading = False
        batch.error_message = "Cancelled by admin."
        batch.upload_completed_at = batch.upload_completed_at or datetime.now(timezone.utc)
        batch.semantic_completed_at = batch.semantic_completed_at or datetime.now(timezone.utc)
        batch.ocr_completed_at = batch.ocr_completed_at or datetime.now(timezone.utc)
        await db.commit()

    return AdminIndexStatusResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_images=batch.total_images,
        processed_images=batch.processed_images,
        failed_images=batch.failed_images,
        queued_images=0,
        running_images=0,
        ocr_processed_images=batch.ocr_processed_images,
        ocr_failed_images=batch.ocr_failed_images,
        ocr_queued_images=0,
        ocr_running_images=0,
        is_uploading=batch.is_uploading,
        error_message=batch.error_message,
        created_at=batch.created_at,
        upload_started_at=batch.upload_started_at,
        upload_completed_at=batch.upload_completed_at,
        semantic_started_at=batch.semantic_started_at,
        semantic_completed_at=batch.semantic_completed_at,
        ocr_started_at=batch.ocr_started_at,
        ocr_completed_at=batch.ocr_completed_at,
    )


@router.get(
    "/index/{batch_id}/items",
    response_model=AdminIndexingItemListResponse,
    summary="List indexing items in batch",
    description="Return images in a user-owned indexing batch. Can be filtered with status=queued/running/indexed/failed/cancelled. Requires authentication and ownership of the batch.",
    responses={
        200: {"description": "Indexing items returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "Authenticated user cannot access this batch or resource."},
    },
    include_in_schema=False,
)
async def list_indexing_items(
    batch_id: str,
    item_status: IndexingItemStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexingItemListResponse:
    """Tra danh sach item trong batch, co the loc anh failed/queued/running/indexed."""
    filters = [IndexingItem.batch_id == batch_id, Image.owner_user_id == current_user.id]
    if item_status is not None:
        filters.append(IndexingItem.status == item_status)

    total = await _count_rows(
        db,
        select(func.count())
        .select_from(IndexingItem)
        .join(Image, Image.id == IndexingItem.image_id)
        .where(*filters),
    )
    offset = (page - 1) * limit
    rows = (
        await db.execute(
            select(IndexingItem, Image)
            .join(Image, Image.id == IndexingItem.image_id)
            .where(*filters)
            .order_by(IndexingItem.created_at.desc(), IndexingItem.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return AdminIndexingItemListResponse(
        items=[_to_admin_indexing_item(item, image) for item, image in rows],
        page=page,
        limit=limit,
        total=total,
    )


@router.post(
    "/index/{batch_id}/items/retry",
    response_model=AdminIndexRetryItemsResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Retry failed indexing items",
    description=(
        "Requeue failed images that are already stored on the server. "
        "If item_ids is omitted, all failed items in the user-owned batch are retried. Requires authentication and ownership of the batch."
    ),
    responses={
        202: {"description": "Failed items were requeued for indexing."},
        400: {"description": "No failed items are available to retry."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "Authenticated user cannot access this batch or resource."},
        404: {"description": "Batch not found."},
        503: {"description": "AI indexing service is unavailable."},
    },
    include_in_schema=False,
)
async def retry_failed_indexing_items(
    batch_id: str,
    payload: AdminIndexRetryItemsRequest | None = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexRetryItemsResponse:
    """Dua lai cac anh failed vao hang doi AI ma khong can upload lai file."""
    batch = await _get_owned_batch(db, batch_id=batch_id, owner_user_id=current_user.id)
    if batch is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            "Indexing batch not found.",
            {"batch_id": batch_id},
        )

    filters = [
        IndexingItem.batch_id == batch_id,
        Image.owner_user_id == current_user.id,
        IndexingItem.status == IndexingItemStatus.failed,
    ]
    requested_item_ids = payload.item_ids if payload and payload.item_ids else None
    if requested_item_ids:
        filters.append(IndexingItem.id.in_(requested_item_ids))

    rows = (
        await db.execute(
            select(IndexingItem, Image)
            .join(Image, Image.id == IndexingItem.image_id)
            .where(*filters)
            .order_by(IndexingItem.updated_at.desc(), IndexingItem.id.desc())
        )
    ).all()

    if not rows:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "NO_FAILED_ITEMS",
            "No failed indexing items are available to retry.",
            {"batch_id": batch_id, "item_ids": requested_item_ids or []},
        )

    queued_items: list[AIIndexItemPayload] = []
    retried_item_ids: list[int] = []
    for item, image in rows:
        image_path = _storage_path_to_backend_path(image.storage_path)
        if not image_path.is_file():
            item.error_message = "Stored image file was not found on server."
            continue

        item.status = IndexingItemStatus.queued
        item.error_message = None
        item.ocr_status = IndexingItemStatus.queued
        item.ocr_retry_count = 0
        item.ocr_error_message = None
        item.semantic_started_at = None
        item.semantic_completed_at = None
        item.ocr_started_at = None
        item.ocr_completed_at = None
        image.status = ImageStatus.pending
        queued_items.append(_build_ai_item_payload(item, image))
        retried_item_ids.append(item.id)

    if not queued_items:
        await db.commit()
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "NO_RETRYABLE_ITEMS",
            "Failed items exist but their stored files are no longer available.",
            {"batch_id": batch_id},
        )

    batch.status = BatchStatus.running
    batch.error_message = None
    batch.is_uploading = False
    batch.semantic_completed_at = None
    batch.ocr_completed_at = None
    await db.commit()

    try:
        ai_response = await ai_indexing_client.enqueue_indexing_items(
            batch_id=batch_id,
            items=queued_items,
        )
    except AIIndexingServiceError as exc:
        await _mark_uploaded_items_failed(db, retried_item_ids, str(exc))
        await _sync_batch_counts(db, batch)
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI_INDEXING_SERVICE_UNAVAILABLE",
            str(exc),
        ) from exc

    await _sync_batch_counts(db, batch)
    return AdminIndexRetryItemsResponse(
        batch_id=batch_id,
        queued_items=ai_response.queued_items,
        retried_item_ids=retried_item_ids,
    )


@router.post(
    "/index/upload",
    response_model=AdminIndexUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Legacy upload image batch",
    description="Legacy flow: upload all images to a user-owned server folder first, then call /index/{batch_id}/start to index the folder. Prefer the new item-level batch flow. Requires authentication and ownership of the batch.",
    responses={
        201: {"description": "Legacy batch uploaded successfully."},
        400: {"description": "Missing file or unsupported file type."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "Authenticated user cannot access this batch or resource."},
        413: {"description": "File or batch size exceeds the allowed limit."},
    },
    include_in_schema=False,
)
async def upload_indexing_batch(
    files: list[UploadFile] = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexUploadResponse:
    """Receive multiple images from FE and create a queued batch without starting AI indexing."""
    if not files:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "At least one image file is required.",
            {"field": "files"},
        )

    batch_id = f"idx_{uuid.uuid4().hex[:12]}"
    upload_dir = Path(settings.admin_index_upload_dir) / batch_id
    upload_dir.mkdir(parents=True, exist_ok=True)

    saved_count = 0
    total_bytes = 0
    max_batch_bytes = settings.admin_index_batch_max_mb * 1024 * 1024
    try:
        for file in files:
            original_content = await _read_and_validate_upload_file(file)
            optimized_content, _, _, _ = _optimize_uploaded_image(file, original_content)
            total_bytes += len(optimized_content)
            if total_bytes > max_batch_bytes:
                raise api_error(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    "PAYLOAD_TOO_LARGE",
                    f"Batch upload must be <= {settings.admin_index_batch_max_mb}MB.",
                    {
                        "field": "files",
                        "maxBatchMb": settings.admin_index_batch_max_mb,
                        "currentBatchBytes": total_bytes,
                    },
                )

            filename = _safe_filename(file.filename or f"image_{saved_count + 1}.jpg")
            target = _dedupe_path(upload_dir / filename)
            target.write_bytes(optimized_content)
            saved_count += 1
    except Exception:
        for uploaded_file in upload_dir.glob("*"):
            if uploaded_file.is_file():
                uploaded_file.unlink(missing_ok=True)
        raise

    batch = IndexingBatch(
        batch_id=batch_id,
        owner_user_id=current_user.id,
        status=BatchStatus.queued,
        total_images=saved_count,
        processed_images=0,
        failed_images=0,
    )
    db.add(batch)
    await db.commit()
    await db.refresh(batch)

    return AdminIndexUploadResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_images=batch.total_images,
        uploaded_files=saved_count,
    )


@router.post(
    "/index/{batch_id}/start",
    response_model=AdminIndexStartResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start legacy batch indexing",
    description=(
        "Start AI indexing for a legacy batch that was already uploaded to the server. "
        "For the new item-level flow, images are queued immediately after upload. Requires authentication and ownership of the batch."
    ),
    responses={
        202: {"description": "Indexing task accepted."},
        400: {"description": "Batch has no uploaded images."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "Authenticated user cannot access this batch or resource."},
        404: {"description": "Batch not found."},
        503: {"description": "AI indexing service is unavailable."},
    },
    include_in_schema=False,
)
async def start_batch_indexing(
    batch_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexStartResponse:
    """Start AI indexing for an uploaded batch."""
    batch = await _get_owned_batch(db, batch_id=batch_id, owner_user_id=current_user.id)
    if batch is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            "Indexing batch not found.",
            {"batch_id": batch_id},
        )
    if batch.status == BatchStatus.running:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "INDEXING_ALREADY_RUNNING",
            "Indexing batch is already running.",
            {"batch_id": batch_id},
        )
    if batch.status == BatchStatus.completed:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "INDEXING_ALREADY_COMPLETED",
            "Indexing batch is already completed.",
            {"batch_id": batch_id},
        )
    if batch.total_images <= 0:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "Indexing batch has no uploaded images.",
            {"batch_id": batch_id},
        )

    try:
        ai_payload = await ai_indexing_client.start_local_indexing(
            batch_id=batch.batch_id,
            image_folder=f"/app/{settings.admin_index_upload_dir}/{batch.batch_id}",
            storage_prefix=f"/static/images/admin_uploads/{batch.batch_id}",
            max_images=batch.total_images,
            run_all=True,
        )
    except AIIndexingServiceError as exc:
        batch.status = BatchStatus.failed
        batch.error_message = str(exc)
        batch.failed_images = batch.total_images
        await db.commit()
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI_INDEXING_SERVICE_UNAVAILABLE",
            str(exc),
        ) from exc

    batch.status = ai_payload.status
    batch.total_images = ai_payload.total_images
    batch.processed_images = 0
    batch.failed_images = 0
    batch.error_message = None
    await db.commit()

    return AdminIndexStartResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_images=batch.total_images,
    )


@router.get(
    "/index/status/{batch_id}",
    response_model=AdminIndexStatusResponse,
    summary="Get indexing batch status",
    description="Return progress for a user-owned indexing batch so the frontend can update progress bars. Requires authentication and ownership of the batch.",
    responses={
        200: {"description": "Batch status returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "Authenticated user cannot access this batch or resource."},
        404: {"description": "Batch not found."},
    },
    include_in_schema=False,
)
async def get_batch_status(
    batch_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexStatusResponse:
    """Return indexing status for a batch."""
    batch = await _get_owned_batch(db, batch_id=batch_id, owner_user_id=current_user.id)
    if batch is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            "Indexing batch not found.",
            {"batch_id": batch_id},
        )

    item_count = await _count_rows(
        db,
        select(func.count()).select_from(IndexingItem).where(IndexingItem.batch_id == batch_id),
    )
    if item_count > 0:
        await _sync_batch_counts(db, batch)
    elif not batch.is_uploading and batch.total_images == 0:
        batch.status = BatchStatus.completed
        batch.processed_images = 0
        batch.failed_images = 0
        batch.error_message = None
        await db.commit()
    else:
        try:
            ai_status = await ai_indexing_client.get_indexing_status(batch_id)
            batch.status = ai_status.status
            batch.total_images = ai_status.total_images
            batch.processed_images = ai_status.processed_images
            batch.failed_images = ai_status.failed_images
            batch.error_message = ai_status.error_message
            await db.commit()
        except AIIndexingServiceError:
            pass

    queued_images, running_images = await _get_active_item_counts(db, batch.batch_id)
    ocr_queued_images, ocr_running_images = await _get_active_ocr_counts(db, batch.batch_id)
    return AdminIndexStatusResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_images=batch.total_images,
        processed_images=batch.processed_images,
        failed_images=batch.failed_images,
        queued_images=queued_images,
        running_images=running_images,
        ocr_processed_images=batch.ocr_processed_images,
        ocr_failed_images=batch.ocr_failed_images,
        ocr_queued_images=ocr_queued_images,
        ocr_running_images=ocr_running_images,
        is_uploading=batch.is_uploading,
        error_message=batch.error_message,
        created_at=batch.created_at,
        upload_started_at=batch.upload_started_at,
        upload_completed_at=batch.upload_completed_at,
        semantic_started_at=batch.semantic_started_at,
        semantic_completed_at=batch.semantic_completed_at,
        ocr_started_at=batch.ocr_started_at,
        ocr_completed_at=batch.ocr_completed_at,
    )


async def _get_owned_batch(
    db: AsyncSession,
    *,
    batch_id: str,
    owner_user_id: int,
) -> IndexingBatch | None:
    return await db.scalar(
        select(IndexingBatch).where(
            IndexingBatch.batch_id == batch_id,
            IndexingBatch.owner_user_id == owner_user_id,
        )
    )


async def _sync_batch_if_active(db: AsyncSession, batch: IndexingBatch) -> None:
    if batch.status in {BatchStatus.queued, BatchStatus.running}:
        item_count = await _count_rows(
            db,
            select(func.count()).select_from(IndexingItem).where(IndexingItem.batch_id == batch.batch_id),
        )
        if item_count > 0:
            await _sync_batch_counts(db, batch)
        else:
            try:
                ai_status = await ai_indexing_client.get_indexing_status(batch.batch_id)
                batch.status = ai_status.status
                batch.total_images = ai_status.total_images
                batch.processed_images = ai_status.processed_images
                batch.failed_images = ai_status.failed_images
                batch.error_message = ai_status.error_message
                await db.commit()
            except AIIndexingServiceError:
                pass


@router.get(
    "/index/batches",
    response_model=AdminIndexBatchListResponse,
    summary="List indexing batches",
    description="Return recent user-owned indexing batches so the current user can track upload/indexing history. Requires authentication.",
    responses={
        200: {"description": "Indexing batches returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
    },
    include_in_schema=False,
)
async def list_batches(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexBatchListResponse:
    """Return recent indexing batches for admin dashboard."""
    items = (
        await db.scalars(
            select(IndexingBatch)
            .where(IndexingBatch.owner_user_id == current_user.id)
            .order_by(IndexingBatch.created_at.desc())
            .limit(20)
        )
    ).all()
    await _sync_batch_counts_for_batches(db, list(items))
    return AdminIndexBatchListResponse(items=list(items))


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


def _to_admin_image_out(image: Image) -> AdminImageOut:
    return AdminImageOut(
        id=image.id,
        image_url=build_image_url(image.storage_path),
        storage_path=image.storage_path,
        filename=image.original_filename or Path(image.storage_path.replace("\\", "/")).name or f"image_{image.id}",
        source_type=image.source_type,
        status=image.status,
        mime_type=image.mime_type,
        file_size=image.file_size,
        width=image.width,
        height=image.height,
        created_at=image.created_at,
        updated_at=image.updated_at,
    )


def _delete_qdrant_vector(point_id: str | None, image_id: int) -> bool:
    try:
        return QdrantSearchService().delete_image_vector(point_id=point_id, image_id=image_id)
    except Exception:
        # Neu Qdrant dang loi, DB van xoa anh de anh khong con hien thi trong search.
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


def _to_admin_indexing_item(item: IndexingItem, image: Image) -> AdminIndexingItemOut:
    return AdminIndexingItemOut(
        id=item.id,
        batch_id=item.batch_id,
        image_id=item.image_id,
        image_url=build_image_url(image.storage_path),
        storage_path=image.storage_path,
        filename=image.original_filename or Path(image.storage_path.replace("\\", "/")).name or f"image_{image.id}",
        status=item.status,
        retry_count=item.retry_count,
        max_retries=item.max_retries,
        error_message=item.error_message,
        ocr_status=item.ocr_status,
        ocr_retry_count=item.ocr_retry_count,
        ocr_error_message=item.ocr_error_message,
        semantic_started_at=item.semantic_started_at,
        semantic_completed_at=item.semantic_completed_at,
        ocr_started_at=item.ocr_started_at,
        ocr_completed_at=item.ocr_completed_at,
        created_at=item.created_at,
        updated_at=item.updated_at,
    )


def _normalize_optional_image_urls(image_urls: list[str] | None, file_count: int) -> list[str] | None:
    if image_urls is None:
        return None
    if len(image_urls) != file_count:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "image_urls must have the same length as files when provided.",
            {"imageUrls": len(image_urls), "files": file_count},
        )
    normalized = [value.strip() for value in image_urls]
    has_retry = any(normalized)
    if not has_retry:
        return None
    return normalized


async def _prepare_failed_replacement_item(
    *,
    db: AsyncSession,
    batch_id: str,
    owner_user_id: int,
    image_url: str,
    file: UploadFile,
    content: bytes,
    mime_type: str | None,
    width: int | None,
    height: int | None,
    checksum: str,
) -> tuple[Image, IndexingItem]:
    storage_path = _normalize_image_url_to_storage_path(image_url)
    image = await db.scalar(
        select(Image).where(
            Image.storage_path == storage_path,
            Image.owner_user_id == owner_user_id,
        )
    )
    if image is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "IMAGE_NOT_FOUND",
            "Image not found for the provided URL.",
            {"image_url": image_url, "storage_path": storage_path},
        )
    if image.status != ImageStatus.failed:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "IMAGE_NOT_FAILED",
            "Only failed images can be replaced and queued for re-indexing.",
            {"image_id": image.id, "status": image.status},
        )

    item = await db.scalar(
        select(IndexingItem)
        .where(IndexingItem.image_id == image.id, IndexingItem.batch_id == batch_id)
        .order_by(IndexingItem.updated_at.desc(), IndexingItem.id.desc())
        .limit(1)
    )
    if item is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "INDEXING_ITEM_NOT_FOUND",
            "Failed image does not belong to this indexing batch.",
            {"batch_id": batch_id, "image_id": image.id},
        )
    if item.status in {IndexingItemStatus.queued, IndexingItemStatus.running}:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "IMAGE_INDEXING_ALREADY_ACTIVE",
            "Image is already queued or running for indexing.",
            {"image_id": image.id, "item_id": item.id, "status": item.status},
        )
    if item.status != IndexingItemStatus.failed:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "INDEXING_ITEM_NOT_FAILED",
            "Only failed indexing items can be retried.",
            {"image_id": image.id, "item_id": item.id, "status": item.status},
        )

    target_path = _storage_path_to_backend_path(image.storage_path)
    target_path.parent.mkdir(parents=True, exist_ok=True)
    target_path.write_bytes(content)

    image.original_filename = file.filename or image.original_filename or target_path.name
    image.mime_type = mime_type
    image.file_size = len(content)
    image.width = width
    image.height = height
    image.checksum = checksum
    image.status = ImageStatus.pending
    item.status = IndexingItemStatus.queued
    item.error_message = None
    return image, item

async def _get_duplicate_upload_checksums(
    db: AsyncSession,
    checksums: set[str],
    *,
    owner_user_id: int,
) -> set[str]:
    if not checksums:
        return set()

    image_checksums = set(
        await db.scalars(
            select(Image.checksum).where(
                Image.checksum.in_(checksums),
                Image.owner_user_id == owner_user_id,
                Image.status.in_([ImageStatus.indexed, ImageStatus.pending, ImageStatus.deleted]),
            )
        )
    )
    active_item_checksums = set(
        await db.scalars(
            select(Image.checksum)
            .select_from(IndexingItem)
            .join(Image, Image.id == IndexingItem.image_id)
            .where(
                Image.checksum.in_(checksums),
                Image.owner_user_id == owner_user_id,
                IndexingItem.status.in_([IndexingItemStatus.queued, IndexingItemStatus.running]),
            )
        )
    )
    return image_checksums | active_item_checksums

def _normalize_image_url_to_storage_path(image_url: str) -> str:
    raw_value = image_url.strip()
    if not raw_value:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "image_url is required.",
            {"field": "image_url"},
        )

    parsed = urlparse(raw_value)
    path = parsed.path if parsed.scheme or parsed.netloc else raw_value
    path = unquote(path).replace("\\", "/")
    if path.startswith(settings.image_base_url.rstrip("/")):
        path = urlparse(path).path
    if path.startswith("static/"):
        path = f"/{path}"
    if not path.startswith("/static/"):
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "INVALID_IMAGE_URL",
            "image_url must point to a stored /static image.",
            {"image_url": image_url},
        )
    return path


def _storage_path_to_backend_path(storage_path: str) -> Path:
    normalized = storage_path.replace("\\", "/")
    if normalized.startswith("/static/"):
        relative_path = normalized.removeprefix("/static/")
    elif normalized.startswith("static/"):
        relative_path = normalized.removeprefix("static/")
    else:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "INVALID_STORAGE_PATH",
            "Only local /static images can be replaced.",
            {"storage_path": storage_path},
        )

    static_root = Path(settings.static_files_dir).resolve()
    target_path = (static_root / relative_path).resolve()
    if target_path != static_root and static_root not in target_path.parents:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "INVALID_STORAGE_PATH",
            "Resolved image path is outside the static directory.",
            {"storage_path": storage_path},
        )
    return target_path

def _storage_path_to_ai_path(storage_path: str) -> str:
    normalized = storage_path.replace("\\", "/")
    if normalized.startswith("/static/"):
        return f"/app{normalized}"
    if normalized.startswith("static/"):
        return f"/app/{normalized}"
    return normalized


def _build_ai_item_payload(item: IndexingItem, image: Image) -> AIIndexItemPayload:
    return AIIndexItemPayload(
        item_id=item.id,
        image_id=image.id,
        image_path=_storage_path_to_ai_path(image.storage_path),
        storage_path=image.storage_path,
        original_filename=image.original_filename,
        owner_user_id=image.owner_user_id,
    )

async def _count_rows(db: AsyncSession, statement) -> int:
    value = await db.scalar(statement)
    return int(value or 0)


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
                "field": "files",
                "filename": filename,
                "allowedContentTypes": sorted(ALLOWED_IMAGE_TYPES),
                "allowedExtensions": sorted(ALLOWED_IMAGE_EXTENSIONS),
            },
        )

    max_bytes = settings.admin_index_upload_max_mb * 1024 * 1024
    content = await file.read(max_bytes + 1)
    if len(content) > max_bytes:
        raise api_error(
            status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            "PAYLOAD_TOO_LARGE",
            f"Each image must be <= {settings.admin_index_upload_max_mb}MB.",
            {"field": "files", "filename": filename, "maxMb": settings.admin_index_upload_max_mb},
        )
    return content



def _optimize_uploaded_image(file: UploadFile, content: bytes) -> tuple[bytes, str | None, int | None, int | None]:
    try:
        with PILImage.open(BytesIO(content)) as source_image:
            image = ImageOps.exif_transpose(source_image)
            original_width, original_height = image.size
            max_dimension = settings.admin_index_image_max_dimension
            should_resize = (
                settings.admin_index_optimize_images
                and max_dimension > 0
                and max(original_width, original_height) > max_dimension
            )
            if should_resize:
                image = image.copy()
                image.thumbnail((max_dimension, max_dimension), PILImage.Resampling.LANCZOS)

            if not settings.admin_index_optimize_images:
                return content, file.content_type, original_width, original_height

            image_format = _resolve_output_image_format(file, image)
            output = BytesIO()
            save_kwargs: dict[str, object] = {"optimize": True}
            if image_format in {"JPEG", "WEBP"}:
                save_kwargs["quality"] = settings.admin_index_image_quality
            if image_format == "JPEG" and image.mode not in {"RGB", "L"}:
                image = image.convert("RGB")
            image.save(output, format=image_format, **save_kwargs)
            optimized = output.getvalue()
            if not should_resize and len(optimized) >= len(content):
                return content, file.content_type, original_width, original_height
            width, height = image.size
            return optimized, _mime_type_for_image_format(image_format, file.content_type), width, height
    except (OSError, UnidentifiedImageError):
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "Uploaded file is not a valid image.",
            {"field": "files", "filename": file.filename or ""},
        )


def _resolve_output_image_format(file: UploadFile, image: PILImage.Image) -> str:
    configured_format = settings.admin_index_image_format.upper()
    if configured_format in {"JPEG", "PNG", "WEBP"}:
        return configured_format

    source_format = (image.format or "").upper()
    if source_format in {"JPEG", "PNG", "WEBP"}:
        return source_format

    content_type = (file.content_type or "").lower()
    if content_type == "image/png":
        return "PNG"
    if content_type == "image/webp":
        return "WEBP"
    return "JPEG"


def _mime_type_for_image_format(image_format: str, fallback: str | None) -> str | None:
    if image_format == "JPEG":
        return "image/jpeg"
    if image_format == "PNG":
        return "image/png"
    if image_format == "WEBP":
        return "image/webp"
    return fallback

def _safe_filename(filename: str) -> str:
    safe = Path(filename).name.replace(" ", "_")
    safe = "".join(char for char in safe if char.isalnum() or char in {".", "_", "-"})
    return safe or f"image_{uuid.uuid4().hex[:8]}.jpg"


def _dedupe_path(path: Path) -> Path:
    if not path.exists():
        return path

    stem = path.stem
    suffix = path.suffix
    parent = path.parent
    counter = 1
    while True:
        candidate = parent / f"{stem}_{counter}{suffix}"
        if not candidate.exists():
            return candidate
        counter += 1


async def _get_active_item_counts(db: AsyncSession, batch_id: str) -> tuple[int, int]:
    queued_images = await _count_rows(
        db,
        select(func.count())
        .select_from(IndexingItem)
        .where(IndexingItem.batch_id == batch_id, IndexingItem.status == IndexingItemStatus.queued),
    )
    running_images = await _count_rows(
        db,
        select(func.count())
        .select_from(IndexingItem)
        .where(IndexingItem.batch_id == batch_id, IndexingItem.status == IndexingItemStatus.running),
    )
    return queued_images, running_images


async def _get_active_ocr_counts(db: AsyncSession, batch_id: str) -> tuple[int, int]:
    queued_images = await _count_rows(
        db,
        select(func.count())
        .select_from(IndexingItem)
        .where(IndexingItem.batch_id == batch_id, IndexingItem.ocr_status == IndexingItemStatus.queued),
    )
    running_images = await _count_rows(
        db,
        select(func.count())
        .select_from(IndexingItem)
        .where(IndexingItem.batch_id == batch_id, IndexingItem.ocr_status == IndexingItemStatus.running),
    )
    return queued_images, running_images


async def _sync_batch_counts(db: AsyncSession, batch: IndexingBatch) -> None:
    await _sync_batch_counts_for_batches(db, [batch])


async def _sync_batch_counts_for_batches(
    db: AsyncSession,
    batches: list[IndexingBatch],
) -> None:
    if not batches:
        return

    batch_ids = [batch.batch_id for batch in batches]
    rows = (
        await db.execute(
            select(
                IndexingItem.batch_id.label("batch_id"),
                func.count(IndexingItem.id).label("total"),
                func.sum(case((IndexingItem.status == IndexingItemStatus.indexed, 1), else_=0)).label("indexed"),
                func.sum(case((IndexingItem.status == IndexingItemStatus.failed, 1), else_=0)).label("failed"),
                func.sum(case((IndexingItem.status == IndexingItemStatus.queued, 1), else_=0)).label("queued"),
                func.sum(case((IndexingItem.status == IndexingItemStatus.running, 1), else_=0)).label("running"),
                func.sum(case((IndexingItem.status == IndexingItemStatus.cancelled, 1), else_=0)).label("cancelled"),
                func.sum(case((IndexingItem.ocr_status == IndexingItemStatus.indexed, 1), else_=0)).label("ocr_indexed"),
                func.sum(case((IndexingItem.ocr_status == IndexingItemStatus.failed, 1), else_=0)).label("ocr_failed"),
                func.sum(case((IndexingItem.ocr_status == IndexingItemStatus.queued, 1), else_=0)).label("ocr_queued"),
                func.sum(case((IndexingItem.ocr_status == IndexingItemStatus.running, 1), else_=0)).label("ocr_running"),
                func.min(IndexingItem.semantic_started_at).label("semantic_started_at"),
                func.max(IndexingItem.semantic_completed_at).label("semantic_completed_at"),
                func.min(IndexingItem.ocr_started_at).label("ocr_started_at"),
                func.max(IndexingItem.ocr_completed_at).label("ocr_completed_at"),
            )
            .where(IndexingItem.batch_id.in_(batch_ids))
            .group_by(IndexingItem.batch_id)
        )
    ).all()
    counts_by_batch_id = {row.batch_id: row for row in rows}

    has_item_batches = False
    legacy_active_batches: list[IndexingBatch] = []
    for batch in batches:
        counts = counts_by_batch_id.get(batch.batch_id)
        if counts is None:
            if not batch.is_uploading and batch.total_images == 0:
                batch.status = BatchStatus.completed
                batch.processed_images = 0
                batch.failed_images = 0
                batch.ocr_processed_images = 0
                batch.ocr_failed_images = 0
                batch.error_message = None
                completed_at = batch.upload_completed_at or datetime.now(timezone.utc)
                batch.semantic_completed_at = batch.semantic_completed_at or completed_at
                batch.ocr_completed_at = batch.ocr_completed_at or completed_at
                has_item_batches = True
            elif batch.status in {BatchStatus.queued, BatchStatus.running}:
                legacy_active_batches.append(batch)
            continue

        has_item_batches = True
        total = int(counts.total or 0)
        indexed = int(counts.indexed or 0)
        failed = int(counts.failed or 0)
        queued = int(counts.queued or 0)
        running = int(counts.running or 0)
        cancelled = int(counts.cancelled or 0)
        ocr_indexed = int(counts.ocr_indexed or 0)
        ocr_failed = int(counts.ocr_failed or 0)
        ocr_queued = int(counts.ocr_queued or 0)
        ocr_running = int(counts.ocr_running or 0)

        batch.total_images = total
        batch.processed_images = indexed
        batch.failed_images = failed
        batch.ocr_processed_images = ocr_indexed
        batch.ocr_failed_images = ocr_failed
        batch.semantic_started_at = batch.semantic_started_at or counts.semantic_started_at
        batch.ocr_started_at = batch.ocr_started_at or counts.ocr_started_at
        semantic_done = not batch.is_uploading and indexed + failed >= total
        ocr_done = semantic_done and ocr_indexed + ocr_failed + failed >= total
        if semantic_done:
            batch.semantic_completed_at = batch.semantic_completed_at or counts.semantic_completed_at or datetime.now(timezone.utc)
        if ocr_done:
            batch.ocr_completed_at = batch.ocr_completed_at or counts.ocr_completed_at or datetime.now(timezone.utc)
        if batch.status == BatchStatus.cancelled or cancelled > 0:
            batch.status = BatchStatus.cancelled
            batch.is_uploading = False
        elif total == 0:
            batch.status = BatchStatus.running if batch.is_uploading else BatchStatus.queued
        elif batch.is_uploading or queued > 0 or running > 0 or ocr_queued > 0 or ocr_running > 0:
            batch.status = BatchStatus.running
        elif semantic_done and ocr_done:
            batch.status = BatchStatus.completed
        else:
            batch.status = BatchStatus.running

    if has_item_batches:
        await db.commit()

    legacy_batches_updated = False
    for batch in legacy_active_batches:
        try:
            ai_status = await ai_indexing_client.get_indexing_status(batch.batch_id)
        except AIIndexingServiceError:
            continue

        batch.status = ai_status.status
        batch.total_images = ai_status.total_images
        batch.processed_images = ai_status.processed_images
        batch.failed_images = ai_status.failed_images
        batch.error_message = ai_status.error_message
        legacy_batches_updated = True

    if legacy_batches_updated:
        await db.commit()


async def _mark_uploaded_items_failed(db: AsyncSession, item_ids: list[int], error_message: str) -> None:
    if not item_ids:
        return

    items = (
        await db.scalars(
            select(IndexingItem).where(IndexingItem.id.in_(item_ids))
        )
    ).all()
    image_ids: list[int] = []
    for item in items:
        item.status = IndexingItemStatus.failed
        item.error_message = error_message
        item.semantic_completed_at = datetime.now(timezone.utc)
        item.ocr_status = IndexingItemStatus.cancelled
        item.ocr_error_message = "Semantic indexing could not be enqueued."
        item.ocr_completed_at = datetime.now(timezone.utc)
        image_ids.append(item.image_id)

    images = (
        await db.scalars(
            select(Image).where(Image.id.in_(image_ids))
        )
    ).all()
    for image in images:
        image.status = ImageStatus.failed

    await db.commit()

# Alias cong khai cho indexing. Giu /admin/index/* de FE hien tai khong bi loi contract.
indexing_router.add_api_route(
    "/batches",
    create_indexing_batch,
    methods=["POST"],
    response_model=AdminBatchCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create indexing batch",
    description="Create an empty user-owned indexing batch so the frontend can upload images in chunks. Requires authentication.",
    responses={201: {"description": "Batch created successfully."}, 401: {"description": "Missing, invalid, or expired token."}},
)
indexing_router.add_api_route(
    "/batches/{batch_id}/images",
    upload_images_to_batch,
    methods=["POST"],
    response_model=AdminBatchImageUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload images to batch and enqueue indexing",
    description="Upload one chunk of images to a user-owned batch and enqueue accepted images for AI indexing. Requires authentication and ownership of the batch.",
    responses={
        201: {"description": "Upload succeeded and items were enqueued to AI."},
        400: {"description": "Missing file or unsupported file type."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "Authenticated user cannot access this batch or resource."},
        404: {"description": "Batch not found."},
        409: {"description": "Batch is closed and cannot accept more uploads."},
        413: {"description": "File or upload chunk size exceeds the allowed limit."},
        503: {"description": "AI indexing service is unavailable."},
    },
)
indexing_router.add_api_route(
    "/batches/{batch_id}/complete-upload",
    complete_batch_upload,
    methods=["POST"],
    response_model=AdminBatchCompleteUploadResponse,
    summary="Complete batch upload",
    description="Mark a user-owned batch upload as complete after all upload chunks are finished. Indexing continues for queued/running items.",
)
indexing_router.add_api_route(
    "/batches/{batch_id}/cancel",
    cancel_indexing_batch,
    methods=["POST"],
    response_model=AdminIndexStatusResponse,
    summary="Cancel indexing batch",
    description="Cancel queued/running items in a user-owned batch. Requires authentication and ownership of the batch.",
)
indexing_router.add_api_route(
    "/{batch_id}/items",
    list_indexing_items,
    methods=["GET"],
    response_model=AdminIndexingItemListResponse,
    summary="List indexing items in batch",
    description="Return images in a user-owned indexing batch. Can be filtered with status=queued/running/indexed/failed/cancelled.",
)
indexing_router.add_api_route(
    "/{batch_id}/items/retry",
    retry_failed_indexing_items,
    methods=["POST"],
    response_model=AdminIndexRetryItemsResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Retry failed indexing items",
    description="Requeue failed images that are already stored on the server. If item_ids is omitted, all failed items in the user-owned batch are retried.",
)
indexing_router.add_api_route(
    "/upload",
    upload_indexing_batch,
    methods=["POST"],
    response_model=AdminIndexUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Legacy upload image batch",
    description="Legacy flow kept for backward compatibility. Prefer POST /index/batches followed by POST /index/batches/{batch_id}/images.",
)
indexing_router.add_api_route(
    "/{batch_id}/start",
    start_batch_indexing,
    methods=["POST"],
    response_model=AdminIndexStartResponse,
    status_code=status.HTTP_202_ACCEPTED,
    summary="Start legacy batch indexing",
    description="Start AI indexing for a legacy batch. New item-level uploads are queued immediately and normally do not need this endpoint.",
)
indexing_router.add_api_route(
    "/status/{batch_id}",
    get_batch_status,
    methods=["GET"],
    response_model=AdminIndexStatusResponse,
    summary="Get indexing batch status",
    description="Return progress for a user-owned indexing batch so the frontend can update progress bars.",
)
indexing_router.add_api_route(
    "/batches",
    list_batches,
    methods=["GET"],
    response_model=AdminIndexBatchListResponse,
    summary="List indexing batches",
    description="Return recent user-owned indexing batches so the current user can track upload/indexing history.",
)

