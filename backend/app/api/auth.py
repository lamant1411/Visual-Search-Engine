"""Auth routes cho register tài khoản."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.session import get_db
from app.schemas.user import UserCreate, UserResponse
from app.services.auth import register_user

router = APIRouter()


@router.post("/register", response_model=UserResponse)
async def register(payload: UserCreate, db: AsyncSession = Depends(get_db)) -> UserResponse:
    try:
        return await register_user(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

