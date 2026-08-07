"""Bảng theo dõi tiến trình indexing hàng loạt cho Admin."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.schemas.common import BatchStatus

if TYPE_CHECKING:
    from app.models.indexing_item import IndexingItem
    from app.models.user import User


class IndexingBatch(Base):
    # Dùng cho dashboard Admin để xem tiến độ index.
    __tablename__ = "indexing_batches"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    batch_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    status: Mapped[BatchStatus] = mapped_column(
        SAEnum(BatchStatus, name="batch_status", native_enum=False, create_constraint=True),
        nullable=False,
        default=BatchStatus.queued,
    )
    total_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    processed_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    failed_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ocr_processed_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ocr_failed_images: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_uploading: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    upload_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    upload_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    semantic_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    semantic_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ocr_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ocr_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    owner: Mapped["User | None"] = relationship()
    items: Mapped[list["IndexingItem"]] = relationship(back_populates="batch")
