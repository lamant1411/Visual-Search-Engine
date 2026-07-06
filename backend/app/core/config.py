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

    jwt_secret_key: str = Field(default="change-me")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24


@lru_cache
def get_settings() -> Settings:
    """Cache cấu hình để chỉ đọc biến môi trường một lần."""
    return Settings()


settings = get_settings()
