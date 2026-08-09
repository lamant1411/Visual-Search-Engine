"""Health check endpoints for backend monitoring."""

from fastapi import APIRouter, Depends, Response, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db

router = APIRouter()


@router.get(
    "",
    summary="Backend liveness check",
    description="Return a lightweight liveness status for the backend process. This endpoint does not require authentication.",
    responses={200: {"description": "Backend process is alive."}},
)
async def health_check() -> dict[str, str]:
    return {"status": "ok", "service": "backend"}


@router.get(
    "/ready",
    summary="Backend readiness check",
    description="Check whether the backend can connect to required internal dependencies such as PostgreSQL. This endpoint does not require authentication.",
    responses={
        200: {"description": "Backend dependencies are ready."},
        503: {"description": "At least one required backend dependency is not ready."},
    },
)
async def readiness_check(
    response: Response,
    db: AsyncSession = Depends(get_db),
) -> dict[str, object]:
    checks: dict[str, str] = {}
    ready = True

    try:
        await db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        ready = False
        checks["database"] = "unavailable"

    if not ready:
        response.status_code = status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "ok" if ready else "unavailable",
        "service": "backend",
        "checks": checks,
    }
