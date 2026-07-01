"""Bảng tùy chọn để lưu lịch sử truy vấn tìm kiếm."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.user import User


class SearchHistory(Base):
    # Hữu ích cho thống kê và lịch sử người dùng, nhưng không bắt buộc cho MVP.
    __tablename__ = "search_history"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    query_type: Mapped[str] = mapped_column(String(20), nullable=False)
    query_value: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user: Mapped["User"] = relationship(back_populates="search_history")
