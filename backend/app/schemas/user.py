"""Pydantic schemas for user APIs."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr

from app.schemas.common import UserRole


class UserBase(BaseModel):
    email: EmailStr


class UserCreate(UserBase):
    """Request body for account registration."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {"email": "user@example.com", "full_name": "Nguyen Van A", "password": "Pass!123"}
        }
    )

    full_name: str
    password: str


class UserResponse(UserBase):
    """User information returned to the client."""

    model_config = ConfigDict(
        from_attributes=True,
        json_schema_extra={
            "example": {
                "id": 1,
                "email": "user@example.com",
                "username": "user@example.com",
                "full_name": "Nguyen Van A",
                "role": "user",
                "is_active": True,
                "created_at": "2026-07-21T10:00:00Z",
                "updated_at": None,
                "last_login_at": None,
            }
        },
    )

    id: int
    username: str
    full_name: str
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime | None = None
    last_login_at: datetime | None = None


UserOut = UserResponse
