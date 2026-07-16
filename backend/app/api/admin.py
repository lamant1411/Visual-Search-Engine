"""API quản trị cho dashboard và batch indexing."""

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import require_admin
from app.core.config import settings
from app.core.errors import api_error
from app.db.session import get_db
from app.models.image import Image
from app.models.indexing_batch import IndexingBatch
from app.models.user import User
from app.schemas.admin import (
    AdminDashboardResponse,
    AdminIndexBatchListResponse,
    AdminIndexStartResponse,
    AdminIndexStatusResponse,
)
from app.schemas.common import BatchStatus, ImageStatus
from app.services.admin_indexing import AIIndexingServiceError, ai_indexing_client

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp"}


@router.get("/dashboard", response_model=AdminDashboardResponse)
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

    return AdminDashboardResponse(
        total_images=total_images,
        indexed_images=indexed_images,
        pending_images=pending_images,
        failed_images=failed_images,
        total_users=total_users,
        latest_batches=list(latest_batches),
    )


@router.post("/index", response_model=AdminIndexStartResponse, status_code=status.HTTP_202_ACCEPTED)
async def start_batch_indexing(
    files: list[UploadFile] = File(...),
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexStartResponse:
    """Nhận nhiều ảnh từ FE, lưu theo batch rồi yêu cầu AI indexing batch đó."""
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

    try:
        ai_payload = await ai_indexing_client.start_local_indexing(
            batch_id=batch_id,
            image_folder=f"/app/{settings.admin_index_upload_dir}/{batch_id}",
            storage_prefix=f"/static/images/admin_uploads/{batch_id}",
            max_images=saved_count,
            run_all=True,
        )
    except AIIndexingServiceError as exc:
        batch.status = BatchStatus.failed
        batch.error_message = str(exc)
        batch.failed_images = saved_count
        await db.commit()
        raise api_error(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "AI_INDEXING_SERVICE_UNAVAILABLE",
            str(exc),
        ) from exc

    batch.status = ai_payload.status
    batch.total_images = ai_payload.total_images
    await db.commit()

    return AdminIndexStartResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_images=batch.total_images,
        uploaded_files=saved_count,
    )


@router.get("/index/status/{batch_id}", response_model=AdminIndexStatusResponse)
async def get_batch_status(
    batch_id: str,
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexStatusResponse:
    """Trả trạng thái indexing; ưu tiên đồng bộ trạng thái mới nhất từ AI."""
    batch = await db.scalar(select(IndexingBatch).where(IndexingBatch.batch_id == batch_id))
    if batch is None:
        raise api_error(
            status.HTTP_404_NOT_FOUND,
            "NOT_FOUND",
            "Indexing batch not found.",
            {"batch_id": batch_id},
        )

    try:
        ai_status = await ai_indexing_client.get_indexing_status(batch_id)
        batch.status = ai_status.status
        batch.total_images = ai_status.total_images
        batch.processed_images = ai_status.processed_images
        batch.failed_images = ai_status.failed_images
        batch.error_message = ai_status.error_message
        await db.commit()
    except AIIndexingServiceError:
        # Nếu AI restart mất in-memory status, vẫn trả trạng thái cuối cùng đã lưu ở BE.
        pass

    return AdminIndexStatusResponse(
        batch_id=batch.batch_id,
        status=batch.status,
        total_images=batch.total_images,
        processed_images=batch.processed_images,
        failed_images=batch.failed_images,
        error_message=batch.error_message,
    )


@router.get("/index/batches", response_model=AdminIndexBatchListResponse)
async def list_batches(
    _: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
) -> AdminIndexBatchListResponse:
    """Trả lịch sử batch indexing gần nhất cho dashboard admin."""
    items = (
        await db.scalars(
            select(IndexingBatch).order_by(IndexingBatch.created_at.desc()).limit(20)
        )
    ).all()
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