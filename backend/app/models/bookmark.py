"""Bảng tùy chọn để lưu ảnh người dùng đánh dấu yêu thích."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.image import Image
    from app.models.user import User


class Bookmark(Base):
    # Lưu quan hệ user nào đã bookmark ảnh nào.
    __tablename__ = "bookmarks"
    __table_args__ = (
        UniqueConstraint("user_id", "image_id", name="uq_bookmarks_user_image"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="bookmarks")
    image: Mapped["Image"] = relationship(back_populates="bookmarks")
