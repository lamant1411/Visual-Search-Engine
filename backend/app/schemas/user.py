"""Schema Pydantic cho API liên quan đến người dùng."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.common import UserRole


class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    # Mật khẩu dạng thô chỉ được nhận ở tầng API.
    password: str


class UserResponse(UserBase):
    # from_attributes cho phép Pydantic đọc dữ liệu từ ORM SQLAlchemy.
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime | None = None
    last_login_at: datetime | None = None


UserOut = UserResponse

