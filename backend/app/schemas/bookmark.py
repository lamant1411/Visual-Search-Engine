"""Schema Pydantic cho chức năng bookmark ảnh."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BookmarkCreate(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    image_id: int = Field(alias="imageId")


class BookmarkItem(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    id: int
    image_id: int = Field(alias="imageId")
    image_url: str = Field(alias="imageUrl")
    title: str
    saved_at: datetime = Field(alias="savedAt")


class BookmarkDetail(BookmarkItem):
    width: int | None = None
    height: int | None = None
    source: str | None = None
    ocr_text: str | None = Field(default=None, alias="ocrText")


class BookmarkListResponse(BaseModel):
    items: list[BookmarkItem]
    page: int
    limit: int
    total: int


class BookmarkImageIdsResponse(BaseModel):
    image_ids: list[int] = Field(alias="imageIds")


class BookmarkDeleteResponse(BaseModel):
    message: str