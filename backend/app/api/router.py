from fastapi import APIRouter

api_router = APIRouter()

# ---- Sub-routers sẽ được include ở đây khi implement ----
# from app.api import auth, images, search, admin
# api_router.include_router(auth.router, prefix="/auth", tags=["Auth"])
# api_router.include_router(images.router, prefix="/images", tags=["Images"])
# api_router.include_router(search.router, prefix="/search", tags=["Search"])
# api_router.include_router(admin.router, prefix="/admin", tags=["Admin"])
