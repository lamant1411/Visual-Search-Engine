"""add_soft_delete_to_images

Revision ID: 0012_add_soft_delete_to_images
Revises: 0011_add_client_history_key
Create Date: 2026-07-30
"""
from alembic import op
import sqlalchemy as sa


revision = "0012_add_soft_delete_to_images"
down_revision = "0011_add_client_history_key"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("images", sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("images", sa.Column("deleted_by_user_id", sa.Integer(), nullable=True))
    op.add_column("images", sa.Column("status_before_delete", sa.String(length=20), nullable=True))
    op.create_index(op.f("ix_images_deleted_by_user_id"), "images", ["deleted_by_user_id"], unique=False)
    op.create_foreign_key(
        "fk_images_deleted_by_user_id_users",
        "images",
        "users",
        ["deleted_by_user_id"],
        ["id"],
    )

    op.execute("ALTER TABLE images DROP CONSTRAINT IF EXISTS image_status")
    op.execute("ALTER TABLE images DROP CONSTRAINT IF EXISTS ck_images_status")
    op.execute("ALTER TABLE images DROP CONSTRAINT IF EXISTS ck_images_image_status")
    op.create_check_constraint(
        "ck_images_status",
        "images",
        "status IN ('pending', 'indexed', 'failed', 'deleted')",
    )


def downgrade() -> None:
    op.execute("UPDATE images SET status = COALESCE(status_before_delete, 'failed') WHERE status = 'deleted'")
    op.execute("ALTER TABLE images DROP CONSTRAINT IF EXISTS image_status")
    op.execute("ALTER TABLE images DROP CONSTRAINT IF EXISTS ck_images_status")
    op.execute("ALTER TABLE images DROP CONSTRAINT IF EXISTS ck_images_image_status")
    op.create_check_constraint(
        "ck_images_status",
        "images",
        "status IN ('pending', 'indexed', 'failed')",
    )

    op.drop_constraint("fk_images_deleted_by_user_id_users", "images", type_="foreignkey")
    op.drop_index(op.f("ix_images_deleted_by_user_id"), table_name="images")
    op.drop_column("images", "status_before_delete")
    op.drop_column("images", "deleted_by_user_id")
    op.drop_column("images", "deleted_at")