"""Bảng metadata ảnh dùng cho visual search và OCR."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    # Chỉ dùng cho type hint, không import lúc chạy thật.
    from app.models.bookmark import Bookmark
    from app.models.image_embedding import ImageEmbedding
    from app.models.ocr_text import OCRText
    from app.models.user import User


class Image(Base):
    # Chỉ lưu metadata file; vector embedding được lưu ở Qdrant.
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    source_type: Mapped[str] = mapped_column(String(20), nullable=False, default="dataset")
    storage_path: Mapped[str] = mapped_column(String(512), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    mime_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    width: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height: Mapped[int | None] = mapped_column(Integer, nullable=True)
    checksum: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )

    # Ảnh từ dataset có thể không thuộc về user nào.
    owner: Mapped["User | None"] = relationship(back_populates="images")
    embedding: Mapped["ImageEmbedding | None"] = relationship(back_populates="image", uselist=False)
    ocr_text: Mapped["OCRText | None"] = relationship(back_populates="image", uselist=False)
    bookmarks: Mapped[list["Bookmark"]] = relationship(back_populates="image")
