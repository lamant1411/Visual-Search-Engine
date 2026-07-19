"""Schema cho API bookmark cua nguoi dung."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BookmarkMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    width: int | None = None
    height: int | None = None
    source: str | None = None
    ocr_text: str | None = Field(default=None, alias="ocrText")


class BookmarkItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    image_id: int = Field(alias="imageId")
    thumbnail_url: str = Field(alias="thumbnailUrl")
    image_url: str = Field(alias="imageUrl")
    saved_at: datetime = Field(alias="savedAt")
    metadata: BookmarkMetadata


class BookmarkListResponse(BaseModel):
    items: list[BookmarkItem]
    page: int
    limit: int
    total: int


class BookmarkImageIdsResponse(BaseModel):
    image_ids: list[int] = Field(alias="imageIds")
