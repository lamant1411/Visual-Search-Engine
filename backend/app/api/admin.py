"""API quản trị cho dashboard và batch indexing."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.config import settings
from app.core.errors import api_error
from app.db.session import get_db
from app.models.image import Image
from app.models.indexing_item import IndexingItem
from app.models.indexing_batch import IndexingBatch
from app.models.user import User
from app.schemas.admin import (
    AdminBatchCompleteUploadResponse,
    AdminBatchCreateResponse,
    AdminBatchImageUploadResponse,
    AdminDashboardResponse,
    AdminIndexBatchListResponse,
    AdminIndexStartResponse,
    AdminIndexStatusResponse,
    AdminIndexingItemListResponse,
    AdminIndexUploadResponse,
    AdminUserListResponse,
)
from app.schemas.common import BatchStatus, ImageSourceType, ImageStatus, IndexingItemStatus
from app.services.admin_indexing import AIIndexingServiceError, AIIndexItemPayload, ai_indexing_client

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@router.get(
    "/dashboard",
    response_model=AdminDashboardResponse,
    summary="Get admin dashboard stats",
    description="Return total images, indexed/pending/failed image counts, total users, and latest indexing batches. Requires admin role.",
    responses={
        200: {"description": "Dashboard stats returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
    },
)
async def get_dashboard(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminDashboardResponse:
    """Trả số liệu tổng quan cho dashboard admin."""
    total_images = await _count_rows(db, select(func.count()).select_from(Image))
    indexed_images = await _count_rows(
        db, select(func.count()).select_from(Image).where(Image.status == ImageStatus.indexed)
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


@router.post(
    "/index/batches",
    response_model=AdminBatchCreateResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create indexing batch",
    description="Create an empty batch so the frontend can upload images in chunks. After creating a batch, call /index/batches/{batch_id}/images. Requires admin role.",
    responses={
        201: {"description": "Batch created successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
    },
)
async def create_indexing_batch(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminBatchCreateResponse:
    """Tao batch rong de FE upload anh theo tung chunk."""
    batch = IndexingBatch(
        batch_id=f"idx_{uuid.uuid4().hex[:12]}",
        status=BatchStatus.queued,
        total_images=0,
        processed_images=0,
        failed_images=0,
        is_uploading=True,
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
        is_uploading=batch.is_uploading,
    )


@router.post(
    "/index/batches/{batch_id}/images",
    response_model=AdminBatchImageUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Upload images to batch and enqueue indexing",
    description=(
        "Receive multipart/form-data field files. Each image is limited by ADMIN_INDEX_UPLOAD_MAX_MB, "
        "and each batch is limited by ADMIN_INDEX_BATCH_MAX_MB. Saved images are sent to the AI queue for item-level indexing. Requires admin role."
    ),
    responses={
        201: {"description": "Upload succeeded and items were enqueued to AI."},
        400: {"description": "Missing file or unsupported file type. Only JPG, PNG, and WebP are supported."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
        404: {"description": "Batch not found."},
        409: {"description": "Batch is closed and cannot accept more uploads."},
        413: {"description": "File or total batch size exceeds the allowed limit."},
        503: {"description": "AI indexing service is unavailable."},
    },
)
async def upload_images_to_batch(
    batch_id: str,
    files: list[UploadFile] = File(...),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminBatchImageUploadResponse:
    """Upload anh vao batch va queue index tung anh ngay sau khi luu thanh cong."""
    batch = await db.scalar(select(IndexingBatch).where(IndexingBatch.batch_id == batch_id))
    if batch is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            "Indexing batch not found.",
            {"batch_id": batch_id},
        )
    if batch.status in {BatchStatus.completed, BatchStatus.failed, BatchStatus.cancelled}:
        raise api_error(
            status.HTTP_409_CONFLICT,
            "INDEXING_BATCH_CLOSED",
            "Cannot upload images to a closed batch.",
            {"batch_id": batch_id, "status": batch.status},
        )
    if not files:
        raise api_error(
            status.HTTP_400_BAD_REQUEST,
            "VALIDATION_ERROR",
            "At least one image file is required.",
            {"field": "files"},
        )

    upload_dir = Path(settings.admin_index_upload_dir) / batch_id
    upload_dir.mkdir(parents=True, exist_ok=True)
    uploaded_items: list[AIIndexItemPayload] = []
    uploaded_bytes = int(
        await db.scalar(
            select(func.coalesce(func.sum(Image.file_size), 0))
            .join(IndexingItem, IndexingItem.image_id == Image.id)
            .where(IndexingItem.batch_id == batch_id)
        )
        or 0
    )
    max_batch_bytes = settings.admin_index_batch_max_mb * 1024 * 1024

    try:
        for file in files:
            content = await _read_and_validate_upload_file(file)
            uploaded_bytes += len(content)
            if uploaded_bytes > max_batch_bytes:
                raise api_error(
                    status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                    "PAYLOAD_TOO_LARGE",
                    f"Batch upload must be <= {settings.admin_index_batch_max_mb}MB in total.",
                    {
                        "field": "files",
                        "maxBatchMb": settings.admin_index_batch_max_mb,
                        "currentBatchBytes": uploaded_bytes,
                    },
                )

            filename = _safe_filename(file.filename or f"image_{len(uploaded_items) + 1}.jpg")
            target = _dedupe_path(upload_dir / filename)
            target.write_bytes(content)
            storage_path = f"/static/images/admin_uploads/{batch_id}/{target.name}"

            image = Image(
                source_type=ImageSourceType.upload,
                storage_path=storage_path,
                original_filename=file.filename or target.name,
                mime_type=file.content_type,
                file_size=len(content),
                status=ImageStatus.pending,
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

            uploaded_items.append(
                AIIndexItemPayload(
                    item_id=item.id,
                    image_id=image.id,
                    image_path=f"/app/{settings.admin_index_upload_dir}/{batch_id}/{target.name}",
                    storage_path=storage_path,
                    original_filename=image.original_filename,
                )
            )

        batch.status = BatchStatus.running
        batch.is_uploading = True
        batch.total_images += len(uploaded_items)
        await db.commit()
    except Exception:
        await db.rollback()
        for payload in uploaded_items:
            filename = Path(payload.image_path).name
            uploaded_file = upload_dir / filename
            if uploaded_file.is_file():
                uploaded_file.unlink(missing_ok=True)
        raise

    try:
        ai_response = await ai_indexing_client.enqueue_indexing_items(
            batch_id=batch_id,
            items=uploaded_items,
        )
    except AIIndexingServiceError as exc:
        await _mark_uploaded_items_failed(db, [item.item_id for item in uploaded_items], str(exc))
        await _sync_batch_counts(db, batch)
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI_INDEXING_SERVICE_UNAVAILABLE",
            str(exc),
        ) from exc

    return AdminBatchImageUploadResponse(
        batch_id=batch_id,
        uploaded_files=len(uploaded_items),
        total_images=batch.total_images,
        queued_items=ai_response.queued_items,
    )


@router.post(
    "/index/batches/{batch_id}/complete-upload",
    response_model=AdminBatchCompleteUploadResponse,
    summary="Complete batch upload",
    description="Frontend calls this endpoint after all upload chunks are finished. Indexing continues for queued/running items. Requires admin role.",
    responses={
        200: {"description": "Batch upload marked as complete."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
        404: {"description": "Batch not found."},
    },
)
async def complete_batch_upload(
    batch_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminBatchCompleteUploadResponse:
    """Danh dau FE da upload xong batch. Indexing van tiep tuc neu con item queued/running."""
    batch = await db.scalar(select(IndexingBatch).where(IndexingBatch.batch_id == batch_id))
    if batch is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            "Indexing batch not found.",
            {"batch_id": batch_id},
        )
    batch.is_uploading = False
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
    description="Mark queued/running items in this batch as cancelled. Other batches are not affected. Requires admin role.",
    responses={
        200: {"description": "Batch cancelled successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
        404: {"description": "Batch not found."},
    },
)
async def cancel_indexing_batch(
    batch_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexStatusResponse:
    """Cancel queued/running items without stopping other indexing batches."""
    batch = await db.scalar(select(IndexingBatch).where(IndexingBatch.batch_id == batch_id))
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

        batch.status = BatchStatus.cancelled
        batch.is_uploading = False
        batch.error_message = "Cancelled by admin."
        await db.commit()

    return AdminIndexStatusResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_images=batch.total_images,
        processed_images=batch.processed_images,
        failed_images=batch.failed_images,
        queued_images=0,
        running_images=0,
        is_uploading=batch.is_uploading,
        error_message=batch.error_message,
    )


@router.get(
    "/index/{batch_id}/items",
    response_model=AdminIndexingItemListResponse,
    summary="List indexing items in batch",
    description="Return images in a batch. Can be filtered with status=queued/running/indexed/failed/cancelled. Requires admin role.",
    responses={
        200: {"description": "Indexing items returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
    },
)
async def list_indexing_items(
    batch_id: str,
    item_status: IndexingItemStatus | None = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexingItemListResponse:
    """Tra danh sach item trong batch, co the loc anh failed/queued/running/indexed."""
    filters = [IndexingItem.batch_id == batch_id]
    if item_status is not None:
        filters.append(IndexingItem.status == item_status)

    total = await _count_rows(db, select(func.count()).select_from(IndexingItem).where(*filters))
    offset = (page - 1) * limit
    items = (
        await db.scalars(
            select(IndexingItem)
            .where(*filters)
            .order_by(IndexingItem.created_at.desc(), IndexingItem.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()
    return AdminIndexingItemListResponse(items=list(items), page=page, limit=limit, total=total)


@router.post(
    "/index/upload",
    response_model=AdminIndexUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Legacy upload image batch",
    description="Legacy flow: upload all images to the server first, then call /index/{batch_id}/start to index the folder. Prefer the new item-level batch flow. Requires admin role.",
    responses={
        201: {"description": "Legacy batch uploaded successfully."},
        400: {"description": "Missing file or unsupported file type."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
        413: {"description": "File or batch size exceeds the allowed limit."},
    },
)
async def upload_indexing_batch(
    files: list[UploadFile] = File(...),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexUploadResponse:
    """Nhan nhieu anh tu FE va tao batch queued, chua gui AI indexing."""
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
            content = await _read_and_validate_upload_file(file)
            total_bytes += len(content)
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
            target.write_bytes(content)
            saved_count += 1
    except Exception:
        for uploaded_file in upload_dir.glob("*"):
            if uploaded_file.is_file():
                uploaded_file.unlink(missing_ok=True)
        raise

    batch = IndexingBatch(
        batch_id=batch_id,
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
        "For the new item-level flow, images are queued immediately after upload. Requires admin role."
    ),
    responses={
        202: {"description": "Indexing task accepted."},
        400: {"description": "Batch has no uploaded images."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
        404: {"description": "Batch not found."},
        503: {"description": "AI indexing service is unavailable."},
    },
)
async def start_batch_indexing(
    batch_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexStartResponse:
    """Kich hoat AI indexing cho batch da upload."""
    batch = await db.scalar(select(IndexingBatch).where(IndexingBatch.batch_id == batch_id))
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
    description="Return batch progress for frontend polling and progress bar display. Requires admin role.",
    responses={
        200: {"description": "Batch status returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
        404: {"description": "Batch not found."},
    },
)
async def get_batch_status(
    batch_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexStatusResponse:
    """Tráº£ tráº¡ng thÃ¡i indexing; Æ°u tiÃªn Ä‘á»“ng bá»™ tráº¡ng thÃ¡i má»›i nháº¥t tá»« AI."""
    batch = await db.scalar(select(IndexingBatch).where(IndexingBatch.batch_id == batch_id))
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
    return AdminIndexStatusResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_images=batch.total_images,
        processed_images=batch.processed_images,
        failed_images=batch.failed_images,
        queued_images=queued_images,
        running_images=running_images,
        is_uploading=batch.is_uploading,
        error_message=batch.error_message,
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
    description="Return recent indexing batches so admin can track upload/indexing history. Requires admin role.",
    responses={
        200: {"description": "Indexing batches returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
        403: {"description": "User does not have admin role."},
    },
)
async def list_batches(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexBatchListResponse:
    """Tráº£ lá»‹ch sá»­ batch indexing gáº§n nháº¥t cho dashboard admin."""
    items = (
        await db.scalars(
            select(IndexingBatch).order_by(IndexingBatch.created_at.desc()).limit(20)
        )
    ).all()
    await _sync_batch_counts_for_batches(db, list(items))
    return AdminIndexBatchListResponse(items=list(items))


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
            # Legacy folder batches have no indexing_items and are synced from AI status.
            if batch.status in {BatchStatus.queued, BatchStatus.running}:
                legacy_active_batches.append(batch)
            continue

        has_item_batches = True
        total = int(counts.total or 0)
        indexed = int(counts.indexed or 0)
        failed = int(counts.failed or 0)
        queued = int(counts.queued or 0)
        running = int(counts.running or 0)
        cancelled = int(counts.cancelled or 0)

        batch.total_images = total
        batch.processed_images = indexed
        batch.failed_images = failed
        if batch.status == BatchStatus.cancelled or cancelled > 0:
            batch.status = BatchStatus.cancelled
            batch.is_uploading = False
        elif total == 0:
            batch.status = BatchStatus.running if batch.is_uploading else BatchStatus.queued
        elif batch.is_uploading or queued > 0 or running > 0:
            batch.status = BatchStatus.running
        else:
            batch.status = BatchStatus.completed

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
        image_ids.append(item.image_id)

    images = (
        await db.scalars(
            select(Image).where(Image.id.in_(image_ids))
        )
    ).all()
    for image in images:
        image.status = ImageStatus.failed

    await db.commit()
