"""Các enum dùng chung cho schema API."""

from enum import Enum


class UserRole(str, Enum):
    user = "user"
    admin = "admin"


class ImageStatus(str, Enum):
    pending = "pending"
    indexed = "indexed"
    failed = "failed"


class BatchStatus(str, Enum):
    queued = "queued"
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class IndexingItemStatus(str, Enum):
    queued = "queued"
    running = "running"
    indexed = "indexed"
    failed = "failed"
    cancelled = "cancelled"


class SearchQueryType(str, Enum):
    image = "image"
    semantic = "semantic"
    ocr = "ocr"


class ImageSourceType(str, Enum):
    dataset = "dataset"
    upload = "upload"
