"""Pydantic schemas for authentication."""

from pydantic import BaseModel, ConfigDict


class LoginRequest(BaseModel):
    """Request body for login."""

    model_config = ConfigDict(
        json_schema_extra={"example": {"email": "user@example.com", "password": "Pass!123"}}
    )

    email: str
    password: str


class TokenSchema(BaseModel):
    """Bearer token response."""

    model_config = ConfigDict(
        json_schema_extra={
            "example": {
                "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                "token_type": "bearer",
                "refresh_token": "plain-refresh-token-value",
            }
        }
    )

    access_token: str
    token_type: str = "bearer"
    refresh_token: str | None = None


class RefreshRequest(BaseModel):
    """Request body for refreshing access token."""

    model_config = ConfigDict(json_schema_extra={"example": {"refresh_token": "plain-refresh-token-value"}})

    refresh_token: str


class LogoutResponse(BaseModel):
    """Response after successful logout."""

    message: str = "Logged out successfully"
