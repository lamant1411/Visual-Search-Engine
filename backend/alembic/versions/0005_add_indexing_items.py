"""Add indexing items table."""

from alembic import op
import sqlalchemy as sa


revision = "0005_add_indexing_items"
down_revision = "0004_increase_path_len"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("indexing_batches", sa.Column("is_uploading", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        "indexing_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("batch_id", sa.String(length=100), nullable=False),
        sa.Column("image_id", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=7), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_retries", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=True),
        sa.CheckConstraint("status IN ('queued', 'running', 'indexed', 'failed')", name="ck_indexing_items_status"),
        sa.ForeignKeyConstraint(["batch_id"], ["indexing_batches.batch_id"], name="fk_indexing_items_batch_id"),
        sa.ForeignKeyConstraint(["image_id"], ["images.id"], name="fk_indexing_items_image_id", ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("batch_id", "image_id", name="uq_indexing_items_batch_image"),
    )
    op.create_index("ix_indexing_items_batch_id", "indexing_items", ["batch_id"], unique=False)
    op.create_index("ix_indexing_items_image_id", "indexing_items", ["image_id"], unique=False)
    op.create_index("ix_indexing_items_status", "indexing_items", ["status"], unique=False)
    op.create_index("ix_indexing_items_created_at", "indexing_items", ["created_at"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_indexing_items_created_at", table_name="indexing_items")
    op.drop_index("ix_indexing_items_status", table_name="indexing_items")
    op.drop_index("ix_indexing_items_image_id", table_name="indexing_items")
    op.drop_index("ix_indexing_items_batch_id", table_name="indexing_items")
    op.drop_table("indexing_items")
    op.drop_column("indexing_batches", "is_uploading")
