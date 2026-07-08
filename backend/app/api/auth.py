"""Auth routes cho register, login, refresh token và logout."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import create_access_token
from app.db.session import get_db
from app.models.user import User
from app.schemas.auth import LoginRequest, LogoutResponse, RefreshRequest, TokenSchema
from app.schemas.user import UserCreate, UserResponse
from app.services.auth import (
    authenticate_user,
    create_refresh_token,
    register_user,
    revoke_all_refresh_tokens,
    rotate_refresh_token,
)

router = APIRouter()


@router.post("/register", response_model=UserResponse)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> UserResponse:
    try:
        return await register_user(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/login", response_model=TokenSchema)
async def login_access_token(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenSchema:
    """Đăng nhập bằng JSON body và trả access token + refresh token."""
    email = payload.email.lower().strip()
    user = await authenticate_user(db, email=email, password=payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sai email hoặc mật khẩu",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tài khoản đã bị vô hiệu hóa",
        )

    access_token = create_access_token(subject=user.email)
    refresh_token = await create_refresh_token(db, user.id)
    return TokenSchema(access_token=access_token, refresh_token=refresh_token)


@router.post("/refresh", response_model=TokenSchema)
async def refresh_access_token(
    body: RefreshRequest, db: AsyncSession = Depends(get_db)
) -> TokenSchema:
    """Đổi refresh token hợp lệ lấy access token mới + refresh token mới (rotation)."""
    result = await rotate_refresh_token(db, body.refresh_token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token không hợp lệ hoặc đã hết hạn",
        )
    user, new_refresh_token = result
    access_token = create_access_token(subject=user.email)
    return TokenSchema(access_token=access_token, refresh_token=new_refresh_token)


@router.post("/logout", response_model=LogoutResponse)
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LogoutResponse:
    """Thu hồi tất cả refresh token của user hiện tại."""
    await revoke_all_refresh_tokens(db, current_user.id)
    return LogoutResponse()


@router.get("/me", response_model=UserResponse)
async def read_users_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Lấy thông tin của người dùng hiện tại."""
    return current_user
