"""add user library performance indexes

Revision ID: 0021_user_library_perf
Revises: 0020_same_length_ocr
Create Date: 2026-08-06
"""

from alembic import op


revision = "0021_user_library_perf"
down_revision = "0020_same_length_ocr"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_images_owner_checksum_status",
        "images",
        ["owner_user_id", "checksum", "status"],
        unique=False,
    )
    op.create_index(
        "ix_images_storage_owner",
        "images",
        ["storage_path", "owner_user_id"],
        unique=False,
    )
    op.create_index(
        "ix_images_status_source_type",
        "images",
        ["status", "source_type"],
        unique=False,
    )
    op.create_index(
        "ix_indexing_batches_owner_created_id",
        "indexing_batches",
        ["owner_user_id", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_indexing_items_batch_created_id",
        "indexing_items",
        ["batch_id", "created_at", "id"],
        unique=False,
    )
    op.create_index(
        "ix_indexing_items_batch_ocr_status_id",
        "indexing_items",
        ["batch_id", "ocr_status", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_indexing_items_batch_ocr_status_id", table_name="indexing_items")
    op.drop_index("ix_indexing_items_batch_created_id", table_name="indexing_items")
    op.drop_index("ix_indexing_batches_owner_created_id", table_name="indexing_batches")
    op.drop_index("ix_images_status_source_type", table_name="images")
    op.drop_index("ix_images_storage_owner", table_name="images")
    op.drop_index("ix_images_owner_checksum_status", table_name="images")
