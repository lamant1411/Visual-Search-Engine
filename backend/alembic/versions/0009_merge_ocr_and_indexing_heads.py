"""Merge OCR and indexing migration heads.

Revision ID: 0009_merge_heads
Revises: 0008_add_cancelled_item_status, b672d13d957e
Create Date: 2026-07-20
"""

revision = "0009_merge_heads"
down_revision = ("0008_add_cancelled_item_status", "b672d13d957e")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
