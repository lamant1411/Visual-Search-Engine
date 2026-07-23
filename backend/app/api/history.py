"""Search history API for the current user."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.search_history import SearchHistory
from app.models.user import User
from app.schemas.search import SearchHistoryItem, SearchHistoryResponse
from app.services.search import build_image_url

router = APIRouter()


@router.get(
    "",
    response_model=SearchHistoryResponse,
    summary="List search history",
    description=(
        "Return search history for the current user, including image, semantic, and OCR searches. "
        "Requires Bearer access_token."
    ),
    responses={
        200: {"description": "Search history returned successfully."},
        401: {"description": "Missing, invalid, or expired token."},
    },
)
async def get_search_history(
    page: int = Query(1, ge=1, description="Current page."),
    limit: int = Query(20, ge=1, le=100, description="Number of items per page."),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchHistoryResponse:
    """Return search history of the current authenticated user."""
    total = int(
        await db.scalar(
            select(func.count())
            .select_from(SearchHistory)
            .where(SearchHistory.user_id == current_user.id)
        )
        or 0
    )
    offset = (page - 1) * limit
    items = (
        await db.scalars(
            select(SearchHistory)
            .where(SearchHistory.user_id == current_user.id)
            .order_by(SearchHistory.created_at.desc(), SearchHistory.id.desc())
            .offset(offset)
            .limit(limit)
        )
    ).all()

    history_items = [
        SearchHistoryItem(
            id=item.id,
            query_type=item.query_type,
            query_value=item.query_value,
            query_image_url=build_image_url(item.query_image_url) if item.query_image_url else None,
            created_at=item.created_at,
        )
        for item in items
    ]

    return SearchHistoryResponse(items=history_items, page=page, limit=limit, total=total)
