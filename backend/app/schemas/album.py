"""Pydantic schemas cho album anh."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import ImageStatus, ImageSourceType


class AlbumCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    cover_image_id: int | None = None


class AlbumUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=255)
    description: str | None = Field(default=None, max_length=2000)
    cover_image_id: int | None = None


class AlbumImageBulkRequest(BaseModel):
    image_ids: list[int] = Field(min_length=1)


class AlbumFailedImageItem(BaseModel):
    image_id: int
    code: str
    message: str


class AlbumOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None = None
    cover_image_id: int | None = None
    cover_image_url: str | None = None
    image_count: int = 0
    created_at: datetime
    updated_at: datetime | None = None
    deleted_at: datetime | None = None


class AlbumListResponse(BaseModel):
    items: list[AlbumOut]
    page: int
    limit: int
    total: int


class AlbumDeleteResponse(BaseModel):
    album_id: int
    deleted: bool


class AlbumImageChangeResponse(BaseModel):
    album_id: int
    added_image_ids: list[int] = []
    removed_image_ids: list[int] = []
    failed_items: list[AlbumFailedImageItem] = []
    added_count: int = 0
    removed_count: int = 0
    failed_count: int = 0


class AlbumImageItem(BaseModel):
    id: int
    thumbnail_url: str
    image_url: str
    original_filename: str | None = None
    status: ImageStatus
    source_type: ImageSourceType
    width: int | None = None
    height: int | None = None
    ocr_text: str | None = None
    added_at: datetime


class AlbumImageListResponse(BaseModel):
    items: list[AlbumImageItem]
    page: int
    limit: int
    total: int
