"""Schema Pydantic cho dữ liệu phản hồi xác thực."""

from pydantic import BaseModel


class LoginRequest(BaseModel):
    """Body request cho API login."""

    email: str
    password: str


class TokenSchema(BaseModel):
    # Dạng phản hồi chuẩn cho bearer token.
    access_token: str
    token_type: str = "bearer"
    refresh_token: str | None = None


class RefreshRequest(BaseModel):
    """Body request để đổi refresh token lấy access token mới."""
    refresh_token: str


class LogoutResponse(BaseModel):
    """Response khi logout thành công."""

    message: str = "Logged out successfully"
