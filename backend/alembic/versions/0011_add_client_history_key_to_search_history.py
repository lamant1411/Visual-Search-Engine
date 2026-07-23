"""add_client_history_key_to_search_history

Revision ID: 0011_add_client_history_key
Revises: 0010_add_query_image_url
Create Date: 2026-07-23
"""
from alembic import op
import sqlalchemy as sa


revision = "0011_add_client_history_key"
down_revision = "0010_add_query_image_url"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "search_history",
        sa.Column("client_history_key", sa.String(length=100), nullable=True),
    )
    op.create_unique_constraint(
        "uq_search_history_user_type_key",
        "search_history",
        ["user_id", "query_type", "client_history_key"],
    )


def downgrade() -> None:
    op.drop_constraint("uq_search_history_user_type_key", "search_history", type_="unique")
    op.drop_column("search_history", "client_history_key")
