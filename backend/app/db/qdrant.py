"""Quản lý kết nối tới Qdrant Vector Database."""

from qdrant_client import QdrantClient

from app.core.config import settings

# Khởi tạo instance duy nhất cho Qdrant (dùng trong suốt vòng đời ứng dụng)
qdrant_client = QdrantClient(url=settings.qdrant_url)

def get_qdrant_client() -> QdrantClient:
    """Trả về instance của QdrantClient."""
    return qdrant_client
