"""Nghiệp vụ cho register tài khoản."""

import re

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password
from app.models.user import User
from app.schemas.common import UserRole
from app.schemas.user import UserCreate, UserResponse


def _validate_password_strength(password: str) -> None:
    if len(password) < 8:
        raise ValueError("Mật khẩu phải có ít nhất 8 ký tự")
    if not re.search(r"[A-Z]", password):
        raise ValueError("Mật khẩu phải có ít nhất 1 chữ hoa")
    if not re.search(r"\d", password):
        raise ValueError("Mật khẩu phải có ít nhất 1 chữ số")
    if not re.search(r"[^A-Za-z0-9]", password):
        raise ValueError("Mật khẩu phải có ít nhất 1 ký tự đặc biệt")


async def register_user(db: AsyncSession, payload: UserCreate) -> UserResponse:
    email = payload.email.lower().strip()
    _validate_password_strength(payload.password)
    existing_user = await db.scalar(select(User).where(User.email == email))
    if existing_user is not None:
        raise ValueError("Email đã tồn tại")

    user = User(
        email=email,
        username=email,
        password_hash=hash_password(payload.password),
        role=UserRole.user,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)
