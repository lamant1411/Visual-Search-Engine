"""Allow unified text searches in search history.

Revision ID: 0023_add_hybrid_history
Revises: 0022_add_albums
Create Date: 2026-08-12
"""

from alembic import op


revision = "0023_add_hybrid_history"
down_revision = "0022_add_albums"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("ALTER TABLE search_history DROP CONSTRAINT IF EXISTS search_query_type")
    op.execute("ALTER TABLE search_history DROP CONSTRAINT IF EXISTS ck_search_history_query_type")
    op.create_check_constraint(
        "ck_search_history_query_type",
        "search_history",
        "query_type IN ('image', 'semantic', 'ocr', 'hybrid')",
    )


def downgrade() -> None:
    op.execute("UPDATE search_history SET query_type = 'semantic' WHERE query_type = 'hybrid'")
    op.execute("ALTER TABLE search_history DROP CONSTRAINT IF EXISTS search_query_type")
    op.execute("ALTER TABLE search_history DROP CONSTRAINT IF EXISTS ck_search_history_query_type")
    op.create_check_constraint(
        "ck_search_history_query_type",
        "search_history",
        "query_type IN ('image', 'semantic', 'ocr')",
    )
