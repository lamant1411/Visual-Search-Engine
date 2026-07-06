"""Base declarative của SQLAlchemy dùng chung cho toàn bộ ORM model."""

from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Tất cả bảng trong database nên kế thừa từ class này."""

    pass
