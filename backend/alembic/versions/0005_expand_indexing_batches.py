"""Add execution details to indexing batches."""

from alembic import op
import sqlalchemy as sa


revision = "0005_expand_indexing_batches"
down_revision = "0004_increase_path_len"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "indexing_batches",
        sa.Column("mode", sa.String(length=20), nullable=False, server_default="local"),
    )
    op.add_column(
        "indexing_batches",
        sa.Column("requested_images", sa.Integer(), nullable=False, server_default="10"),
    )
    op.add_column(
        "indexing_batches",
        sa.Column("batch_size", sa.Integer(), nullable=False, server_default="8"),
    )
    op.add_column(
        "indexing_batches",
        sa.Column("source_path", sa.String(length=2048), nullable=True),
    )
    op.add_column(
        "indexing_batches",
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "indexing_batches",
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_indexing_batches_mode",
        "indexing_batches",
        "mode IN ('local', 'urls')",
    )
    op.create_check_constraint(
        "ck_indexing_batches_requested_images",
        "indexing_batches",
        "requested_images > 0",
    )
    op.create_check_constraint(
        "ck_indexing_batches_batch_size",
        "indexing_batches",
        "batch_size > 0",
    )


def downgrade() -> None:
    op.drop_constraint("ck_indexing_batches_batch_size", "indexing_batches", type_="check")
    op.drop_constraint("ck_indexing_batches_requested_images", "indexing_batches", type_="check")
    op.drop_constraint("ck_indexing_batches_mode", "indexing_batches", type_="check")
    op.drop_column("indexing_batches", "finished_at")
    op.drop_column("indexing_batches", "started_at")
    op.drop_column("indexing_batches", "source_path")
    op.drop_column("indexing_batches", "batch_size")
    op.drop_column("indexing_batches", "requested_images")
    op.drop_column("indexing_batches", "mode")
