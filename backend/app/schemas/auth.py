"""Schema Pydantic cho dữ liệu phản hồi xác thực."""

from pydantic import BaseModel


class TokenSchema(BaseModel):
    # Dạng phản hồi chuẩn cho bearer token.
    access_token: str
    token_type: str = "bearer"

