"""API lich su tim kiem cua nguoi dung."""

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.db.session import get_db
from app.models.search_history import SearchHistory
from app.models.user import User
from app.schemas.search import SearchHistoryResponse

router = APIRouter()


@router.get("", response_model=SearchHistoryResponse)
async def get_search_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SearchHistoryResponse:
    """Tra lich su tim kiem cua user dang dang nhap."""
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

    return SearchHistoryResponse(
        items=list(items),
        page=page,
        limit=limit,
        total=total,
    )
