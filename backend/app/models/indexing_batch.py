"""Bảng theo dõi tiến trình indexing hàng loạt cho Admin."""

from datetime import datetime

from sqlalchemy import DateTime, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class IndexingBatch(Base):
    # Dùng cho dashboard Admin để xem tiến độ index.
    __tablename__ = "indexing_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="queued")
    total_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )
