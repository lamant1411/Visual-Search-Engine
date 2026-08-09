from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api.router import api_router
from app.core.config import settings
from app.db.session import AsyncSessionLocal
from app.services.seed import ensure_seed_admin

app = FastAPI(
    title="Visual Search Engine API",
    version="1.0.0",
    description=(
        "API for the Visual Search Engine project. Basic test flow: "
        "1) call /api/v1/auth/login to get access_token, "
        "2) click Authorize in Swagger and paste the Bearer token, "
        "3) call Search, Bookmarks, or History APIs. Admin APIs require role=admin."
    ),
    openapi_tags=[
        {"name": "Health", "description": "Backend liveness and readiness checks."},
        {"name": "Auth", "description": "Register, login, refresh token, logout, and current user."},
        {"name": "Search", "description": "Search images by uploaded image, semantic text, and OCR text."},
        {"name": "History", "description": "Search history of the current authenticated user."},
        {"name": "Image Library", "description": "Browse indexed images available to authenticated users."},
        {"name": "Bookmarks", "description": "Create, list, view, and delete image bookmarks."},
        {"name": "Indexing", "description": "Upload image batches, enqueue indexing, retry failed items, and track progress."},
        {"name": "Admin", "description": "Admin-only dashboard, user list, and admin workspace image management."},
    ],
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

backend_root = Path(__file__).resolve().parent.parent
static_directory = Path(settings.static_files_dir)
if not static_directory.is_absolute():
    static_directory = backend_root / static_directory
static_directory.mkdir(parents=True, exist_ok=True)
app.mount("/static", StaticFiles(directory=static_directory), name="static")

app.include_router(api_router, prefix="/api/v1")


@app.on_event("startup")
async def seed_default_admin() -> None:
    """Tạo admin mặc định từ biến môi trường để test dashboard quản trị."""
    try:
        async with AsyncSessionLocal() as db:
            await ensure_seed_admin(db)
    except Exception as e:
        print(f"Warning: Startup admin seed skipped or failed: {e}")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    del request
    return JSONResponse(
        status_code=500,
        content={
            "code": "INTERNAL_SERVER_ERROR",
            "message": f"Internal Server Error: {str(exc)}",
            "details": {},
        },
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException) -> JSONResponse:
    del request
    if isinstance(exc.detail, dict) and "code" in exc.detail and "message" in exc.detail:
        return JSONResponse(
            status_code=exc.status_code,
            content=exc.detail,
            headers=exc.headers,
        )

    return JSONResponse(
        status_code=exc.status_code,
        content={
            "code": _default_error_code(exc.status_code),
            "message": str(exc.detail),
            "details": {},
        },
        headers=exc.headers,
    )


@app.exception_handler(RequestValidationError)
async def request_validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    del request
    return JSONResponse(
        status_code=422,
        content={
            "code": "VALIDATION_ERROR",
            "message": "Request validation failed.",
            "details": {
                "errors": [
                    {
                        "loc": error.get("loc", []),
                        "msg": error.get("msg", ""),
                        "type": error.get("type", ""),
                    }
                    for error in exc.errors()
                ]
            },
        },
    )


def _default_error_code(status_code: int) -> str:
    if status_code == 401:
        return "UNAUTHORIZED"
    if status_code == 403:
        return "FORBIDDEN"
    if status_code == 404:
        return "NOT_FOUND"
    if status_code == 413:
        return "PAYLOAD_TOO_LARGE"
    if 400 <= status_code < 500:
        return "VALIDATION_ERROR"
    return "INTERNAL_ERROR"


@app.get("/")
async def root():
    return {"message": "Visual Search Engine API"}


@app.get(
    "/health",
    summary="Backend liveness check",
    description="Return a lightweight liveness status for infrastructure health checks.",
    tags=["Health"],
)
async def health():
    return {"status": "ok", "service": "backend"}
