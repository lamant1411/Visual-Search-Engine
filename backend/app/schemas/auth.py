"""Schema Pydantic cho dữ liệu phản hồi xác thực."""

from pydantic import BaseModel

from app.schemas.user import UserOut


class Token(BaseModel):
    # Dạng phản hồi chuẩn cho bearer token.
    access_token: str
    token_type: str = "bearer"


class TokenPayload(BaseModel):
    sub: str | None = None


class LoginResponse(BaseModel):
    # Login trả token kèm user để FE lấy role ngay sau đăng nhập.
    access_token: str
    token_type: str = "bearer"
    user: UserOut
