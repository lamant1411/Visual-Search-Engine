"""fix_image_status_deleted_constraint

Revision ID: 0014_fix_image_status_ck
Revises: 0013_perf_indexes
Create Date: 2026-07-30
"""
from alembic import op


revision = "0014_fix_image_status_ck"
down_revision = "0013_perf_indexes"
branch_labels = None
depends_on = None


def upgrade() -> None:
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