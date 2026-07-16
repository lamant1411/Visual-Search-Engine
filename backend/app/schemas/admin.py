"""Schema Pydantic cho dữ liệu trả về ở màn Admin."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import BatchStatus


class IndexingBatchOut(BaseModel):
    # Phản chiếu bảng indexing_batches để dashboard có thể đọc tiến độ.
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: str
    status: BatchStatus
    total_images: int
    processed_images: int
    failed_images: int
    error_message: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class AdminDashboardResponse(BaseModel):
    total_images: int
    indexed_images: int
    pending_images: int
    failed_images: int
    total_users: int
    latest_batches: list[IndexingBatchOut]


class AdminIndexUploadResponse(BaseModel):
    batch_id: str
    status: BatchStatus
    total_images: int
    uploaded_files: int


class AdminIndexStartResponse(BaseModel):
    batch_id: str
    status: BatchStatus
    total_images: int


class AdminIndexStatusResponse(BaseModel):
    batch_id: str
    status: BatchStatus
    total_images: int = 0
    processed_images: int = 0
    failed_images: int = 0
    error_message: str | None = None


class AdminIndexBatchListResponse(BaseModel):
    items: list[IndexingBatchOut]