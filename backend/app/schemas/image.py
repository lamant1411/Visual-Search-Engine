"""Schema Pydantic cho upload và phản hồi dữ liệu ảnh."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, HttpUrl

from app.schemas.common import ImageSourceType, ImageStatus


class ImageCreate(BaseModel):
    # Chỉ nhận metadata file; phần upload file thật xử lý ở tầng khác.
    source_type: ImageSourceType = ImageSourceType.upload
    storage_path: str
    original_filename: str | None = None
    mime_type: str | None = None
    file_size: int | None = None
    width: int | None = None
    height: int | None = None
    checksum: str | None = None


class ImageOut(ImageCreate):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_user_id: int | None = None
    status: ImageStatus
    deleted_at: datetime | None = None
    deleted_by_user_id: int | None = None
    status_before_delete: str | None = None
    created_at: datetime
    updated_at: datetime | None = None


class ImageSearchParams(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    image_id: int | None = None
    image_url: HttpUrl | None = Field(default=None, alias="imageUrl")
    page: int = 1
    limit: int = 20


class ImageDeleteResponse(BaseModel):
    image_id: int
    deleted: bool
    file_deleted: bool = False
    qdrant_deleted: bool = False


class ImageRestoreResponse(BaseModel):
    image_id: int
    restored: bool
    status: ImageStatus


class ImageBulkDeleteRequest(BaseModel):
    image_ids: list[int] = Field(min_length=1)


class ImageBulkDeleteFailedItem(BaseModel):
    image_id: int
    code: str
    message: str


class ImageBulkDeleteResponse(BaseModel):
    deleted_items: list[ImageDeleteResponse]
    failed_items: list[ImageBulkDeleteFailedItem]
    deleted_count: int
    failed_count: int


class ImageBulkRestoreResponse(BaseModel):
    restored_items: list[ImageRestoreResponse]
    failed_items: list[ImageBulkDeleteFailedItem]
    restored_count: int
    failed_count: int