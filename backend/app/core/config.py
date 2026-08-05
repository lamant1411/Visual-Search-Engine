"""Cấu hình ứng dụng được đọc từ biến môi trường."""

from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Đối tượng cấu hình có kiểu rõ ràng dùng cho toàn bộ backend."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    project_name: str = "Visual Search Engine API"
    api_v1_prefix: str = "/api/v1"

    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@postgres:5432/visual_search"
    )
    qdrant_url: str = Field(default="http://qdrant:6333")
    qdrant_images_collection: str = Field(default="images_collection")
    ai_service_url: str = Field(default="http://ai:8001")
    ai_image_embedding_path: str = Field(default="/api/embed/image")
    ai_text_embedding_path: str = Field(default="/api/embed/text")
    ai_index_local_path: str = Field(default="/api/index/local")
    ai_index_status_path: str = Field(default="/api/index/status/{batch_id}")
    ai_index_items_path: str = Field(default="/api/index/items")
    ai_service_timeout_seconds: float = Field(default=30.0)
    image_embedding_dim: int = Field(default=512)
    image_search_max_upload_mb: int = Field(default=10)
    image_search_max_results: int = Field(default=100)
    admin_index_upload_max_mb: int = Field(default=2)
    admin_index_batch_max_mb: int = Field(default=100)
    admin_index_upload_dir: str = Field(default="static/images/admin_uploads")
    seed_admin_email: str | None = Field(default=None)
    seed_admin_password: str | None = Field(default=None)
    seed_admin_full_name: str = Field(default="System Admin")
    image_base_url: str = Field(default="http://localhost:8000")
    static_files_dir: str = Field(default="static")
    backend_cors_origins: list[str] = Field(
        default=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:4173",
            "http://127.0.0.1:4173",
            "https://visual-search-engine-plum.vercel.app",
        ]
    )

    jwt_secret_key: str = Field(default="change-me")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24


@lru_cache
def get_settings() -> Settings:
    """Cache cấu hình để chỉ đọc biến môi trường một lần."""
    return Settings()


settings = get_settings()