"""Bang theo doi trang thai index tung anh trong mot batch."""

from datetime import datetime

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, Integer, String, Text, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.schemas.common import IndexingItemStatus


class IndexingItem(Base):
    __tablename__ = "indexing_items"
    __table_args__ = (
        UniqueConstraint("batch_id", "image_id", name="uq_indexing_items_batch_image"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    batch_id: Mapped[str] = mapped_column(String(100), ForeignKey("indexing_batches.batch_id"), nullable=False, index=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[IndexingItemStatus] = mapped_column(
        SAEnum(IndexingItemStatus, name="indexing_item_status", native_enum=False, create_constraint=True),
        nullable=False,
        default=IndexingItemStatus.queued,
        index=True,
    )
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_retries: Mapped[int] = mapped_column(Integer, nullable=False, default=3)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_status: Mapped[IndexingItemStatus] = mapped_column(
        SAEnum(
            IndexingItemStatus,
            name="ocr_indexing_item_status",
            native_enum=False,
            create_constraint=True,
        ),
        nullable=False,
        default=IndexingItemStatus.queued,
        index=True,
    )
    ocr_retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    ocr_error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    semantic_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    semantic_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ocr_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    ocr_completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    batch: Mapped["IndexingBatch"] = relationship(back_populates="items")
    image: Mapped["Image"] = relationship(back_populates="indexing_items")
