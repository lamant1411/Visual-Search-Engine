"""Schema Pydantic cho dữ liệu trả về ở màn Admin."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict

from app.schemas.common import BatchStatus, ImageSourceType, ImageStatus, IndexingItemStatus, UserRole


class IndexingBatchOut(BaseModel):
    # Phản chiếu bảng indexing_batches để dashboard có thể đọc tiến độ.
    model_config = ConfigDict(from_attributes=True)

    id: int
    batch_id: str
    status: BatchStatus
    total_images: int
    processed_images: int
    failed_images: int
    ocr_processed_images: int = 0
    ocr_failed_images: int = 0
    error_message: str | None = None
    is_uploading: bool = False
    upload_started_at: datetime | None = None
    upload_completed_at: datetime | None = None
    semantic_started_at: datetime | None = None
    semantic_completed_at: datetime | None = None
    ocr_started_at: datetime | None = None
    ocr_completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None


class AdminDashboardResponse(BaseModel):
    total_images: int
    indexed_images: int
    pending_images: int
    failed_images: int
    total_users: int
    latest_batches: list[IndexingBatchOut]


class AdminUserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    email: str
    username: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime | None = None
    last_login_at: datetime | None = None


class AdminUserListResponse(BaseModel):
    items: list[AdminUserOut]
    page: int
    limit: int
    total: int


class AdminImageOut(BaseModel):
    id: int
    image_url: str
    storage_path: str
    filename: str
    source_type: ImageSourceType
    status: ImageStatus
    mime_type: str | None = None
    file_size: int | None = None
    width: int | None = None
    height: int | None = None
    created_at: datetime
    updated_at: datetime | None = None


class AdminImageListResponse(BaseModel):
    items: list[AdminImageOut]
    page: int
    limit: int
    total: int


class AdminImageDeleteResponse(BaseModel):
    image_id: int
    deleted: bool
    file_deleted: bool = False
    qdrant_deleted: bool = False


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
    queued_images: int = 0
    running_images: int = 0
    ocr_processed_images: int = 0
    ocr_failed_images: int = 0
    ocr_queued_images: int = 0
    ocr_running_images: int = 0
    is_uploading: bool = False
    error_message: str | None = None
    created_at: datetime | None = None
    upload_started_at: datetime | None = None
    upload_completed_at: datetime | None = None
    semantic_started_at: datetime | None = None
    semantic_completed_at: datetime | None = None
    ocr_started_at: datetime | None = None
    ocr_completed_at: datetime | None = None


class AdminBatchCreateResponse(BaseModel):
    batch_id: str
    status: BatchStatus
    total_images: int = 0
    processed_images: int = 0
    failed_images: int = 0
    ocr_processed_images: int = 0
    ocr_failed_images: int = 0
    is_uploading: bool = True
    upload_started_at: datetime | None = None


class AdminBatchImageUploadResponse(BaseModel):
    batch_id: str
    uploaded_files: int
    total_images: int
    queued_items: int
    skipped_files: int = 0


class AdminBatchCompleteUploadResponse(BaseModel):
    batch_id: str
    status: BatchStatus
    total_images: int
    is_uploading: bool = False


class AdminIndexingItemOut(BaseModel):
    id: int
    batch_id: str
    image_id: int
    image_url: str
    storage_path: str
    filename: str
    status: IndexingItemStatus
    retry_count: int
    max_retries: int
    error_message: str | None = None
    ocr_status: IndexingItemStatus
    ocr_retry_count: int
    ocr_error_message: str | None = None
    semantic_started_at: datetime | None = None
    semantic_completed_at: datetime | None = None
    ocr_started_at: datetime | None = None
    ocr_completed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime | None = None


class AdminIndexingItemListResponse(BaseModel):
    items: list[AdminIndexingItemOut]
    page: int
    limit: int
    total: int


class AdminIndexRetryItemsRequest(BaseModel):
    item_ids: list[int] | None = None


class AdminIndexRetryItemsResponse(BaseModel):
    batch_id: str
    queued_items: int
    retried_item_ids: list[int]


class AdminIndexBatchListResponse(BaseModel):
    items: list[IndexingBatchOut]
