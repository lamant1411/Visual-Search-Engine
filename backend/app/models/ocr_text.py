"""Bảng lưu text OCR để tìm kiếm bằng PostgreSQL full-text search."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.image import Image


class OCRText(Base):
    # Bảng này chỉ phục vụ tìm kiếm text, không liên quan đến vector.
    __tablename__ = "ocr_texts"

    image_id: Mapped[int] = mapped_column(ForeignKey("images.id"), primary_key=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    language: Mapped[str | None] = mapped_column(String(20), nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    # Cột này sẽ được PostgreSQL dùng cho full-text search.
    tsv: Mapped[str | None] = mapped_column(TSVECTOR, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    image: Mapped["Image"] = relationship(back_populates="ocr_text")
