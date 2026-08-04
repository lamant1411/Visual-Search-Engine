"""Schema Pydantic cho request tìm kiếm."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import SearchQueryType


class SearchRequest(BaseModel):
    query_type: SearchQueryType
    query_value: str
    page: int = 1
    limit: int = 20


class SearchResultMetadata(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    width: int | None = None
    height: int | None = None
    source: str | None = None
    ocr_text: str | None = Field(default=None, alias="ocrText")


class SearchResultItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    thumbnail_url: str = Field(alias="thumbnailUrl")
    image_url: str = Field(alias="imageUrl")
    similarity_score: float = Field(alias="similarityScore")
    metadata: SearchResultMetadata


class SearchResponse(BaseModel):
    items: list[SearchResultItem]
    page: int
    limit: int
    total: int


class SearchHistoryItem(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    query_type: SearchQueryType = Field(alias="queryType")
    query_value: str = Field(alias="queryValue")
    query_image_url: str | None = Field(default=None, alias="queryImageUrl")
    created_at: datetime = Field(alias="createdAt")


class SearchHistoryResponse(BaseModel):
    items: list[SearchHistoryItem]
    page: int
    limit: int
    total: int
