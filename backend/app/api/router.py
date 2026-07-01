"""Router gốc của API, nơi gắn các router con theo từng tính năng."""

from fastapi import APIRouter

api_router = APIRouter()

# Các router con sẽ được gắn vào đây khi từng module được triển khai.
# from app.api import auth, images, search, admin
# api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
# api_router.include_router(images.router, prefix="/images", tags=["Images"])
# api_router.include_router(search.router, prefix="/search", tags=["Search"])
# api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
