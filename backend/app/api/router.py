"""Router gốc của API, nơi gắn các router con theo từng tính năng."""

from fastapi import APIRouter

from app.api.admin import indexing_router, router as admin_router
from app.api.auth import router as auth_router
from app.api.bookmark import router as bookmark_router
from app.api.health import router as health_router
from app.api.history import router as history_router
from app.api.images import router as images_router
from app.api.search import router as search_router

api_router = APIRouter()

api_router.include_router(health_router, prefix="/health", tags=["Health"])
api_router.include_router(auth_router, prefix="/auth", tags=["Auth"])
api_router.include_router(search_router, prefix="/search", tags=["Search"])
api_router.include_router(history_router, prefix="/history", tags=["History"])
api_router.include_router(images_router, prefix="/images", tags=["Image Library"])
api_router.include_router(bookmark_router, prefix="/bookmarks", tags=["Bookmarks"])
api_router.include_router(indexing_router, prefix="/index", tags=["Indexing"])
api_router.include_router(admin_router, prefix="/admin", tags=["Admin"])
