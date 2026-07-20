"""Allow individual indexing items to be cancelled."""

from alembic import op
import sqlalchemy as sa


revision = "0008_add_cancelled_item_status"
down_revision = "0007_merge_indexing_histories"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_indexing_items_status", "indexing_items", type_="check")
    op.alter_column(
        "indexing_items",
        "status",
        existing_type=sa.String(length=7),
        type_=sa.String(length=9),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "ck_indexing_items_status",
        "indexing_items",
        "status IN ('queued', 'running', 'indexed', 'failed', 'cancelled')",
    )


def downgrade() -> None:
    op.execute(
        "UPDATE indexing_items SET status = 'failed', "
        "error_message = COALESCE(error_message, 'Item was cancelled.') "
        "WHERE status = 'cancelled'"
    )
    op.drop_constraint("ck_indexing_items_status", "indexing_items", type_="check")
    op.alter_column(
        "indexing_items",
        "status",
        existing_type=sa.String(length=9),
        type_=sa.String(length=7),
        existing_nullable=False,
    )
    op.create_check_constraint(
        "ck_indexing_items_status",
        "indexing_items",
        "status IN ('queued', 'running', 'indexed', 'failed')",
    )
