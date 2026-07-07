"""Schema Pydantic cho dữ liệu phản hồi xác thực."""

from pydantic import BaseModel


class TokenSchema(BaseModel):
    # Dạng phản hồi chuẩn cho bearer token.
    access_token: str
    token_type: str = "bearer"
    refresh_token: str | None = None


class RefreshRequest(BaseModel):
    """Body request để đổi refresh token lấy access token mới."""
    refresh_token: str
