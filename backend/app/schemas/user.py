"""Schema Pydantic cho API liên quan đến người dùng."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.schemas.common import UserRole


class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    # Mật khẩu dạng thô chỉ được nhận ở tầng API.
    password: str


class UserOut(UserBase):
    # from_attributes cho phép Pydantic đọc dữ liệu từ ORM SQLAlchemy.
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: int
    role: UserRole
    is_active: bool = Field(alias="isActive")
    created_at: datetime = Field(alias="createdAt")
    updated_at: datetime | None = Field(default=None, alias="updatedAt")
    last_login_at: datetime | None = Field(default=None, alias="lastLoginAt")
