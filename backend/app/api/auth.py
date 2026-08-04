"""Auth routes cho register, login, refresh token, logout, và user hiện tại."""

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


@router.post(
    "/register",
    response_model=UserResponse,
    summary="Register a new account",
    description=(
        "Create a user account. The client sends JSON with email, full_name, and password. "
        "The backend sets username equal to email and stores only the hashed password."
    ),
    responses={
        200: {"description": "Account registered successfully."},
        400: {"description": "Email already exists or password policy failed."},
        422: {"description": "Invalid request body or invalid email format."},
    },
)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> UserResponse:
    try:
        return await register_user(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post(
    "/login",
    response_model=TokenSchema,
    summary="Login",
    description=(
        "Login with a JSON body containing email and password. "
        "The response contains access_token and refresh_token. Use access_token with Swagger Authorize."
    ),
    responses={
        200: {"description": "Login succeeded."},
        400: {"description": "Invalid email or password."},
        403: {"description": "Account is disabled."},
        422: {"description": "Invalid request body."},
    },
)
async def login_access_token(
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> TokenSchema:
    """Login with JSON body and return access token plus refresh token."""
    email = payload.email.lower().strip()
    user = await authenticate_user(db, email=email, password=payload.password)
    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Sai email hoac mat khau",
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Tai khoan da bi vo hieu hoa",
        )

    access_token = create_access_token(subject=user.email)
    refresh_token = await create_refresh_token(db, user.id)
    return TokenSchema(access_token=access_token, refresh_token=refresh_token)


@router.post(
    "/refresh",
    response_model=TokenSchema,
    summary="Refresh access token",
    description=(
        "Exchange a valid refresh_token for a new access_token and refresh_token. "
        "Refresh token rotation is enabled, so the old refresh token cannot be reused."
    ),
    responses={
        200: {"description": "Token refreshed successfully."},
        401: {"description": "Refresh token is invalid or expired."},
        422: {"description": "Invalid request body."},
    },
)
async def refresh_access_token(
    body: RefreshRequest, db: AsyncSession = Depends(get_db)
) -> TokenSchema:
    """Exchange a valid refresh token for a new access token."""
    result = await rotate_refresh_token(db, body.refresh_token)
    if result is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token khong hop le hoac da het han",
        )
    user, new_refresh_token = result
    access_token = create_access_token(subject=user.email)
    return TokenSchema(access_token=access_token, refresh_token=new_refresh_token)


@router.post(
    "/logout",
    response_model=LogoutResponse,
    summary="Logout",
    description="Revoke all refresh tokens of the current user. Requires Bearer access_token.",
    responses={
        200: {"description": "Logout succeeded."},
        401: {"description": "Missing, invalid, or expired token."},
    },
)
async def logout(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> LogoutResponse:
    """Revoke all refresh tokens of the current user."""
    await revoke_all_refresh_tokens(db, current_user.id)
    return LogoutResponse()


@router.get(
    "/me",
    response_model=UserResponse,
    summary="Get current user",
    description="Return the current user from Bearer access_token. Login first, then use Swagger Authorize.",
    responses={
        200: {"description": "Current user returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
    },
)
async def read_users_me(
    current_user: User = Depends(get_current_user),
) -> UserResponse:
    """Return the current authenticated user."""
    return current_user
