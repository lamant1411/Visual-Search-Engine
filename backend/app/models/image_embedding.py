"""Bảng đồng bộ giữa ảnh trong PostgreSQL và point vector trong Qdrant."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.image import Image


class ImageEmbedding(Base):
    # Bảng này không lưu vector, chỉ lưu thông tin map sang Qdrant.
    __tablename__ = "image_embeddings"

    image_id: Mapped[int] = mapped_column(ForeignKey("images.id"), primary_key=True)
    qdrant_point_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    collection_name: Mapped[str] = mapped_column(String(255), nullable=False)
    model_name: Mapped[str] = mapped_column(String(255), nullable=False)
    embedding_dim: Mapped[int] = mapped_column(Integer, nullable=False)
    vector_status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Mỗi ảnh có một bản ghi đồng bộ embedding.
    image: Mapped["Image"] = relationship(back_populates="embedding")
