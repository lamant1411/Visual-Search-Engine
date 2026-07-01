"""Bảng tài khoản người dùng phục vụ xác thực và phân quyền."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    # TYPE_CHECKING giúp tránh import vòng lặp khi chạy runtime.
    from app.models.bookmark import Bookmark
    from app.models.image import Image
    from app.models.refresh_token import RefreshToken
    from app.models.search_history import SearchHistory


class User(Base):
    # Bảng lõi cho cả user thường lẫn admin.
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Một user có thể sở hữu nhiều ảnh upload.
    images: Mapped[list["Image"]] = relationship(back_populates="owner")
    refresh_tokens: Mapped[list["RefreshToken"]] = relationship(back_populates="user")
    search_history: Mapped[list["SearchHistory"]] = relationship(back_populates="user")
    bookmarks: Mapped[list["Bookmark"]] = relationship(back_populates="user")
