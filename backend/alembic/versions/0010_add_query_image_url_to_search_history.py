"""add_query_image_url_to_search_history

Revision ID: 0010_add_query_image_url
Revises: 0009_merge_heads
Create Date: 2026-07-23
"""
from alembic import op
import sqlalchemy as sa


revision = "0010_add_query_image_url"
down_revision = "0009_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "search_history",
        sa.Column("query_image_url", sa.String(length=2048), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("search_history", "query_image_url")
