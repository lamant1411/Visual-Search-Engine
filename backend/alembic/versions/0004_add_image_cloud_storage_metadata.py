"""Increase image storage path length."""

from alembic import op
import sqlalchemy as sa


revision = "0004_increase_path_len"
down_revision = "0003_add_full_name_to_users"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column(
        "images",
        "storage_path",
        existing_type=sa.String(length=512),
        type_=sa.String(length=2048),
        existing_nullable=False,
    )


def downgrade() -> None:
    op.alter_column(
        "images",
        "storage_path",
        existing_type=sa.String(length=2048),
        type_=sa.String(length=512),
        existing_nullable=False,
    )
