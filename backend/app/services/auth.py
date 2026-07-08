"""Nghiệp vụ cho register, login và refresh token."""

import hashlib
import re
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import hash_password, verify_password
from app.models.refresh_token import RefreshToken
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
    full_name = payload.full_name.strip()
    _validate_password_strength(payload.password)
    existing_user = await db.scalar(select(User).where(User.email == email))
    if existing_user is not None:
        raise ValueError("Email đã tồn tại")
    if not full_name:
        raise ValueError("Họ và tên không được để trống")

    user = User(
        email=email,
        username=email,
        full_name=full_name,
        password_hash=hash_password(payload.password),
        role=UserRole.user,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    return UserResponse.model_validate(user)


async def authenticate_user(db: AsyncSession, email: str, password: str) -> User | None:
    """Xác thực người dùng với email và password, cập nhật last_login_at."""
    user = await db.scalar(select(User).where(User.email == email))
    if not user:
        return None
    if not verify_password(password, user.password_hash):
        return None

    # Cập nhật thời điểm đăng nhập cuối.
    user.last_login_at = datetime.now(timezone.utc)
    await db.commit()
    return user


# ── Refresh Token helpers ─────────────────────────────────────────────────────

_REFRESH_TOKEN_BYTES = 32
_REFRESH_TOKEN_EXPIRE_DAYS = 30


def _hash_token(raw: str) -> str:
    """SHA-256 để lưu token hash vào DB, không lưu token thô."""
    return hashlib.sha256(raw.encode()).hexdigest()


async def create_refresh_token(db: AsyncSession, user_id: int) -> str:
    """Tạo refresh token mới, lưu hash vào DB, trả token thô cho client."""
    raw = secrets.token_urlsafe(_REFRESH_TOKEN_BYTES)
    expires = datetime.now(timezone.utc) + timedelta(days=_REFRESH_TOKEN_EXPIRE_DAYS)
    rt = RefreshToken(
        user_id=user_id,
        token_hash=_hash_token(raw),
        expires_at=expires,
    )
    db.add(rt)
    await db.commit()
    return raw


async def rotate_refresh_token(
    db: AsyncSession, raw_token: str
) -> tuple[User, str] | None:
    """
    Xác thực refresh token, thu hồi token cũ và cấp token mới (rotation).
    Trả về (user, new_raw_token) hoặc None nếu token không hợp lệ.
    """
    token_hash = _hash_token(raw_token)
    now = datetime.now(timezone.utc)

    rt = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.token_hash == token_hash,
            RefreshToken.revoked_at.is_(None),
            RefreshToken.expires_at > now,
        )
    )
    if rt is None:
        return None

    # Thu hồi token cũ ngay lập tức (token rotation).
    rt.revoked_at = now
    await db.flush()

    user = await db.get(User, rt.user_id)
    if user is None or not user.is_active:
        await db.rollback()
        return None

    new_raw = await create_refresh_token(db, user.id)
    return user, new_raw


async def revoke_all_refresh_tokens(db: AsyncSession, user_id: int) -> None:
    """Thu hồi tất cả refresh token của user (dùng khi logout)."""
    from sqlalchemy import update

    now = datetime.now(timezone.utc)
    await db.execute(
        update(RefreshToken)
        .where(RefreshToken.user_id == user_id, RefreshToken.revoked_at.is_(None))
        .values(revoked_at=now)
    )
    await db.commit()
