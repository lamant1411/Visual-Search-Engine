"""Seed du lieu mac dinh khi ung dung khoi dong."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import hash_password
from app.models.user import User
from app.schemas.common import UserRole


async def ensure_seed_admin(db: AsyncSession) -> None:
    """Create the default admin account from environment variables if it does not exist."""
    if not settings.seed_admin_email or not settings.seed_admin_password:
        return

    email = settings.seed_admin_email.lower().strip()
    existing_admin = await db.scalar(select(User).where(User.email == email))
    if existing_admin is not None:
        return

    admin = User(
        email=email,
        username=email,
        full_name=settings.seed_admin_full_name.strip() or "System Admin",
        password_hash=hash_password(settings.seed_admin_password),
        role=UserRole.admin,
        is_active=True,
    )
    db.add(admin)
    await db.commit()
