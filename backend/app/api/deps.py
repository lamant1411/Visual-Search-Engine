"""Các dependency dùng chung cho những route của FastAPI."""

# Nên để helper xác thực và truy cập DB ở đây để các endpoint gọn hơn.
#
# Ví dụ (bỏ comment khi triển khai auth):
#
# from fastapi import Depends, HTTPException, status
# from fastapi.security import OAuth2PasswordBearer
# from sqlalchemy.ext.asyncio import AsyncSession
#
# from app.core.security import decode_access_token
# from app.db.session import get_db
#
# oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")
#
# async def get_current_user(
#     token: str = Depends(oauth2_scheme),
#     db: AsyncSession = Depends(get_db),
# ):
#     payload = decode_access_token(token)
#     if payload is None:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Token không hợp lệ hoặc đã hết hạn",
#         )
#     # TODO: truy vấn user từ DB theo payload["sub"]
#     ...
