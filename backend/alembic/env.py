"""Cấu hình chạy migration Alembic cho PostgreSQL."""

import asyncio
import sys
from pathlib import Path

from alembic import context
from sqlalchemy import pool
from sqlalchemy.ext.asyncio import async_engine_from_config

# Đảm bảo Alembic luôn import được package `app` dù chạy trong Docker hay local.
BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from app import models  # noqa: F401
from app.core.config import settings
from app.db.base import Base

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url)

# Alembic đọc metadata từ Base để so sánh model với DB thật.
target_metadata = Base.metadata


def run_migrations_offline() -> None:
    """Chạy migration mà không cần mở kết nối database."""
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def do_run_migrations(connection) -> None:
    """Áp dụng các bước migration trên một kết nối đang mở."""
    context.configure(connection=connection, target_metadata=target_metadata)

    with context.begin_transaction():
        context.run_migrations()


async def run_migrations_online() -> None:
    """Chạy migration trên PostgreSQL đang hoạt động."""
    connectable = async_engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    async with connectable.connect() as connection:
        await connection.run_sync(do_run_migrations)

    await connectable.dispose()


if context.is_offline_mode():
    run_migrations_offline()
else:
    asyncio.run(run_migrations_online())
