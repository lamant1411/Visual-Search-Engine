"""add_query_performance_indexes

Revision ID: 0013_perf_indexes
Revises: 0012_add_soft_delete_to_images
Create Date: 2026-07-30
"""
from alembic import op


revision = "0013_perf_indexes"
down_revision = "0012_add_soft_delete_to_images"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_images_status_created_id",
        "images",
        ["status", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_images_status_checksum",
        "images",
        ["status", "checksum"],
        unique=False,
    )
    op.create_index(
        "ix_images_deleted_status_updated_id",
        "images",
        ["status", "deleted_by_user_id", "updated_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_bookmarks_user_created_id",
        "bookmarks",
        ["user_id", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_search_history_user_created_id",
        "search_history",
        ["user_id", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_search_history_user_type_created_id",
        "search_history",
        ["user_id", "query_type", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_indexing_items_batch_status_id",
        "indexing_items",
        ["batch_id", "status", "id"],
        unique=False,
    )
    op.create_index(
        "ix_indexing_batches_status_created_id",
        "indexing_batches",
        ["status", "created_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_indexing_batches_status_created_id", table_name="indexing_batches")
    op.drop_index("ix_indexing_items_batch_status_id", table_name="indexing_items")
    op.drop_index("ix_search_history_user_type_created_id", table_name="search_history")
    op.drop_index("ix_search_history_user_created_id", table_name="search_history")
    op.drop_index("ix_bookmarks_user_created_id", table_name="bookmarks")
    op.drop_index("ix_images_deleted_status_updated_id", table_name="images")
    op.drop_index("ix_images_status_checksum", table_name="images")
    op.drop_index("ix_images_status_created_id", table_name="images")