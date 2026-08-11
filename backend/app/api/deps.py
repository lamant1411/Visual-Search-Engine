"""Shared dependencies for API routes."""

from fastapi import Depends, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.errors import api_error
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl=f"{settings.api_v1_prefix}/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme), db: AsyncSession = Depends(get_db)
) -> User:
    """Validate JWT and return the current user."""
    credentials_exception = api_error(
        status.HTTP_401_UNAUTHORIZED,
        "INVALID_CREDENTIALS",
        "Could not validate credentials.",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(
            token, settings.jwt_secret_key, algorithms=[settings.jwt_algorithm]
        )
        email: str | None = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception

    user = await db.scalar(select(User).where(User.email == email))
    if user is None:
        raise credentials_exception
    if not user.is_active:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "USER_INACTIVE",
            "User account is inactive.",
        )
    return user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """Allow only admin accounts to access admin routes."""
    if current_user.role != UserRole.admin:
        raise api_error(
            status.HTTP_403_FORBIDDEN,
            "ADMIN_REQUIRED",
            "Admin permission required.",
        )
    return current_user
