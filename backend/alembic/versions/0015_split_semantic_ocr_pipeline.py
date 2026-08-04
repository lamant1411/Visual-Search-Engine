"""split semantic indexing from durable background OCR

Revision ID: 0015_split_semantic_ocr
Revises: 0014_fix_image_status_ck
Create Date: 2026-07-31
"""

from alembic import op
import sqlalchemy as sa


revision = "0015_split_semantic_ocr"
down_revision = "0014_fix_image_status_ck"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    item_columns = {column["name"] for column in inspector.get_columns("indexing_items")}
    batch_columns = {column["name"] for column in inspector.get_columns("indexing_batches")}

    item_column_definitions = (
        sa.Column("ocr_status", sa.String(length=9), nullable=False, server_default="queued"),
        sa.Column("ocr_retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ocr_error_message", sa.Text(), nullable=True),
        sa.Column("semantic_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("semantic_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ocr_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ocr_completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    for column in item_column_definitions:
        if column.name not in item_columns:
            op.add_column("indexing_items", column)

    check_names = {
        constraint["name"] for constraint in inspector.get_check_constraints("indexing_items")
    }
    if "ck_indexing_items_ocr_status" not in check_names:
        op.create_check_constraint(
            "ck_indexing_items_ocr_status",
            "indexing_items",
            "ocr_status IN ('queued', 'running', 'indexed', 'failed', 'cancelled')",
        )
    index_names = {index["name"] for index in inspector.get_indexes("indexing_items")}
    if "ix_indexing_items_ocr_status" not in index_names:
        op.create_index("ix_indexing_items_ocr_status", "indexing_items", ["ocr_status"], unique=False)

    batch_column_definitions = (
        sa.Column("ocr_processed_images", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("ocr_failed_images", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("upload_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("upload_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("semantic_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("semantic_completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ocr_started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ocr_completed_at", sa.DateTime(timezone=True), nullable=True),
    )
    for column in batch_column_definitions:
        if column.name not in batch_columns:
            op.add_column("indexing_batches", column)

    # Rows produced by the old combined pipeline already completed OCR.
    op.execute(
        """
        UPDATE indexing_items
        SET ocr_status = CASE
                WHEN status = 'indexed' THEN 'indexed'
                WHEN status IN ('failed', 'cancelled') THEN 'cancelled'
                ELSE 'queued'
            END,
            semantic_started_at = CASE WHEN status IN ('indexed', 'failed') THEN created_at ELSE NULL END,
            semantic_completed_at = CASE WHEN status IN ('indexed', 'failed') THEN updated_at ELSE NULL END,
            ocr_started_at = CASE WHEN status = 'indexed' THEN created_at ELSE NULL END,
            ocr_completed_at = CASE WHEN status = 'indexed' THEN updated_at ELSE NULL END
        """
    )
    op.execute(
        """
        UPDATE indexing_batches
        SET ocr_processed_images = processed_images,
            upload_started_at = created_at,
            upload_completed_at = CASE WHEN NOT is_uploading THEN updated_at ELSE NULL END,
            semantic_started_at = CASE WHEN total_images > 0 THEN created_at ELSE NULL END,
            semantic_completed_at = CASE WHEN status = 'completed' THEN updated_at ELSE NULL END,
            ocr_started_at = CASE WHEN processed_images > 0 THEN created_at ELSE NULL END,
            ocr_completed_at = CASE WHEN status = 'completed' THEN updated_at ELSE NULL END
        """
    )


def downgrade() -> None:
    for column in (
        "ocr_completed_at",
        "ocr_started_at",
        "semantic_completed_at",
        "semantic_started_at",
        "upload_completed_at",
        "upload_started_at",
        "ocr_failed_images",
        "ocr_processed_images",
    ):
        op.drop_column("indexing_batches", column)
    op.drop_index("ix_indexing_items_ocr_status", table_name="indexing_items")
    op.drop_constraint("ck_indexing_items_ocr_status", "indexing_items", type_="check")
    for column in (
        "ocr_completed_at",
        "ocr_started_at",
        "semantic_completed_at",
        "semantic_started_at",
        "ocr_error_message",
        "ocr_retry_count",
        "ocr_status",
    ):
        op.drop_column("indexing_items", column)
