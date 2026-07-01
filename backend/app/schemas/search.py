"""Schema Pydantic cho request tìm kiếm."""

from enum import Enum

from pydantic import BaseModel


class SearchType(str, Enum):
    # Ba chế độ tìm kiếm nằm trong phạm vi dự án.
    image = "image"
    semantic = "semantic"
    ocr = "ocr"


class SearchRequest(BaseModel):
    query_type: SearchType
    query_value: str
