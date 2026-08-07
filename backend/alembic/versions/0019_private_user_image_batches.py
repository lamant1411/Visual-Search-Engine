"""add owner to indexing batches for private image libraries

Revision ID: 0019_private_user_batches
Revises: 0018_short_ocr_edit
Create Date: 2026-08-05
"""

from alembic import op
import sqlalchemy as sa


revision = "0019_private_user_batches"
down_revision = "0018_short_ocr_edit"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("indexing_batches", sa.Column("owner_user_id", sa.Integer(), nullable=True))
    op.create_index("ix_indexing_batches_owner_user_id", "indexing_batches", ["owner_user_id"], unique=False)
    op.create_foreign_key(
        "fk_indexing_batches_owner_user_id_users",
        "indexing_batches",
        "users",
        ["owner_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_images_owner_status_updated_id",
        "images",
        ["owner_user_id", "status", "updated_at", "id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_images_owner_status_updated_id", table_name="images")
    op.drop_constraint("fk_indexing_batches_owner_user_id_users", "indexing_batches", type_="foreignkey")
    op.drop_index("ix_indexing_batches_owner_user_id", table_name="indexing_batches")
    op.drop_column("indexing_batches", "owner_user_id")
