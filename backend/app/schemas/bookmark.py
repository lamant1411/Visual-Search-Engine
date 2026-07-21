"""Pydantic schemas for image bookmarks."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class BookmarkCreate(BaseModel):
    """Request body for creating a bookmark."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={"example": {"image_id": 123}},
    )

    image_id: int = Field(alias="imageId")


class BookmarkItem(BaseModel):
    """Bookmark item returned in list responses."""

    model_config = ConfigDict(
        populate_by_name=True,
        json_schema_extra={
            "example": {
                "id": 1,
                "image_id": 123,
                "image_url": "http://localhost:8000/static/images/example.jpg",
                "title": "example.jpg",
                "saved_at": "2026-07-21T10:00:00Z",
            }
        },
    )

    id: int
    image_id: int = Field(alias="imageId")
    image_url: str = Field(alias="imageUrl")
    title: str
    saved_at: datetime = Field(alias="savedAt")


class BookmarkDetail(BookmarkItem):
    """Bookmark detail with image metadata and OCR text."""

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
