"""Bang album anh cua tung nguoi dung."""

from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base

if TYPE_CHECKING:
    from app.models.image import Image
    from app.models.user import User


class Album(Base):
    # Album thuoc ve mot user; anh deleted se duoc an khi truy van, khong xoa lien ket ngay.
    __tablename__ = "albums"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    cover_image_id: Mapped[int | None] = mapped_column(ForeignKey("images.id", ondelete="SET NULL"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    owner: Mapped["User"] = relationship(back_populates="albums")
    cover_image: Mapped["Image | None"] = relationship(foreign_keys=[cover_image_id])
    image_links: Mapped[list["AlbumImage"]] = relationship(back_populates="album", cascade="all, delete-orphan")


class AlbumImage(Base):
    # Bang trung gian de mot anh co the nam trong nhieu album.
    __tablename__ = "album_images"
    album_id: Mapped[int] = mapped_column(ForeignKey("albums.id", ondelete="CASCADE"), primary_key=True)
    image_id: Mapped[int] = mapped_column(ForeignKey("images.id", ondelete="CASCADE"), primary_key=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    album: Mapped["Album"] = relationship(back_populates="image_links")
    image: Mapped["Image"] = relationship(back_populates="album_links")
